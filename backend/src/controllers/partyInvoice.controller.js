const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { prisma } = require('../config/db');
const { generatePartyInvoiceNumber } = require('../utils/invoiceNumber');
const { generatePartyInvoicePdf, STORAGE_DIR } = require('../services/partyInvoicePdf');
const { advance } = require('../services/partyInvoiceRecurrence');
const { sendEmail } = require('../services/emailService');
const { makeCommentHandlers } = require('../utils/commentHandlers');
const { PARTY_INVOICE_CATEGORY_LABELS } = require('../constants/partyInvoiceCategories');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('attachment');
const VALID_CATEGORIES = Object.keys(PARTY_INVOICE_CATEGORY_LABELS);

function isOverdue(invoice) {
  return invoice.status === 'UNPAID' && new Date(invoice.dueDate) < new Date();
}

// attachmentData is never included in list/detail JSON responses — served
// separately via downloadInvoiceAttachment — same care as merchant
// .controller.js's apiKeyHash omission.
function toInvoiceResponse(invoice) {
  const { attachmentData, ...rest } = invoice;
  return { ...rest, overdue: isOverdue(invoice), hasAttachment: Boolean(attachmentData || invoice.attachmentName) };
}

/** GET /api/admin/party-invoices?direction=RECEIVABLE&q=... */
async function listInvoices(req, res, next) {
  try {
    const { direction, q } = req.query;
    if (!['RECEIVABLE', 'PAYABLE'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be RECEIVABLE or PAYABLE' });
    }

    const where = { direction };
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { partyName: { contains: term, mode: 'insensitive' } },
        { businessName: { contains: term, mode: 'insensitive' } },
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const invoices = await prisma.partyInvoice.findMany({ where, orderBy: { createdAt: 'desc' } });
    const mapped = invoices.map(toInvoiceResponse);
    // Overdue-first, then newest-first within each group — small table, so
    // sorting in JS after fetch (same approach MerchantsPanel takes
    // client-side) is simpler than a conditional SQL ORDER BY.
    mapped.sort((a, b) => (b.overdue - a.overdue) || (new Date(b.createdAt) - new Date(a.createdAt)));

    res.json({ invoices: mapped });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/party-invoices (multipart/form-data, optional `attachment` file) */
async function createInvoice(req, res, next) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    try {
      const { direction, partyName, businessName, description, amount, gstPercent, dueDate, email, phone, recurrence, status, category, manifestId } = req.body;

      if (!['RECEIVABLE', 'PAYABLE'].includes(direction)) {
        return res.status(400).json({ error: 'direction must be RECEIVABLE or PAYABLE' });
      }
      if (!partyName?.trim() || !description?.trim() || !amount || !dueDate) {
        return res.status(400).json({ error: 'partyName, description, amount and dueDate are required' });
      }
      // Category/manifest linking is a PAYABLE-only concept (see
      // PartyInvoiceCategory) — silently ignored on a RECEIVABLE rather
      // than erroring, since the form simply doesn't show those fields
      // there.
      const categoryValue = direction === 'PAYABLE' && VALID_CATEGORIES.includes(category) ? category : null;
      const manifestIdValue = direction === 'PAYABLE' && manifestId ? manifestId : null;
      const recurrenceValue = ['WEEKLY', 'MONTHLY', 'YEARLY'].includes(recurrence) ? recurrence : 'NONE';
      const statusValue = status === 'PAID' ? 'PAID' : 'UNPAID';

      // Same [manifestId, category] pair the cost-sheet form upserts
      // against — a manual entry here would otherwise collide with it
      // (or a second manual one) at the DB constraint, so check first and
      // give a clear message rather than a raw 500.
      if (manifestIdValue && categoryValue) {
        const conflict = await prisma.partyInvoice.findUnique({ where: { manifestId_category: { manifestId: manifestIdValue, category: categoryValue } } });
        if (conflict) return res.status(409).json({ error: `This manifest already has a ${PARTY_INVOICE_CATEGORY_LABELS[categoryValue]} invoice (${conflict.invoiceNumber}) — edit that one instead.` });
      }

      const amountNum = Number(amount);
      const gstNum = Number(gstPercent) || 0;
      const totalAmount = Math.round((amountNum + amountNum * gstNum / 100) * 100) / 100;
      const invoiceNumber = await generatePartyInvoiceNumber(direction);
      const createdAt = new Date();

      const invoice = await prisma.partyInvoice.create({
        data: {
          direction,
          invoiceNumber,
          partyName: partyName.trim(),
          businessName: businessName?.trim() || null,
          description: description.trim(),
          amount: amountNum,
          gstPercent: gstNum,
          totalAmount,
          dueDate: new Date(dueDate),
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          status: statusValue,
          paidAt: statusValue === 'PAID' ? createdAt : null,
          category: categoryValue,
          manifestId: manifestIdValue,
          recurrence: recurrenceValue,
          nextRecurrenceAt: recurrenceValue !== 'NONE' ? advance(createdAt, recurrenceValue) : null,
          attachmentName: req.file?.originalname || null,
          attachmentMime: req.file?.mimetype || null,
          attachmentData: req.file?.buffer || null,
          createdById: req.user.id,
        },
      });

      const { fileName } = await generatePartyInvoicePdf(invoice);
      const updated = await prisma.partyInvoice.update({ where: { id: invoice.id }, data: { pdfFileUrl: fileName } });

      res.status(201).json({ invoice: toInvoiceResponse(updated) });
    } catch (err) {
      next(err);
    }
  });
}

/** GET /api/admin/party-invoices/:id */
async function getInvoice(req, res, next) {
  try {
    const invoice = await prisma.partyInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ invoice: toInvoiceResponse(invoice) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/party-invoices/:id — general edit (name, amount, due
 * date, category/manifest link, etc.) — separate from
 * updateInvoiceStatus below, which only ever flips paid/unpaid.
 * Recomputes totalAmount from amount+gstPercent when either changes, and
 * regenerates the PDF so a downloaded/emailed copy never shows stale
 * figures after an edit. Doesn't touch the attachment file — re-upload
 * isn't supported here, only on create, to keep this endpoint JSON (no
 * multipart) and simple.
 */
async function updateInvoice(req, res, next) {
  try {
    const existing = await prisma.partyInvoice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const { partyName, businessName, description, amount, gstPercent, dueDate, email, phone, recurrence, category, manifestId, hubId } = req.body;
    const data = {};
    if (partyName !== undefined) {
      if (!partyName.trim()) return res.status(400).json({ error: 'partyName cannot be empty' });
      data.partyName = partyName.trim();
    }
    if (businessName !== undefined) data.businessName = businessName?.trim() || null;
    if (description !== undefined) {
      if (!description.trim()) return res.status(400).json({ error: 'description cannot be empty' });
      data.description = description.trim();
    }
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);
    if (email !== undefined) data.email = email?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (recurrence !== undefined) data.recurrence = ['WEEKLY', 'MONTHLY', 'YEARLY'].includes(recurrence) ? recurrence : 'NONE';

    if (existing.direction === 'PAYABLE') {
      if (category !== undefined) data.category = VALID_CATEGORIES.includes(category) ? category : null;
      if (manifestId !== undefined) data.manifestId = manifestId || null;
      if (hubId !== undefined) data.hubId = hubId || null;
      const nextManifestId = data.manifestId !== undefined ? data.manifestId : existing.manifestId;
      const nextCategory = data.category !== undefined ? data.category : existing.category;
      if (nextManifestId && nextCategory) {
        const conflict = await prisma.partyInvoice.findFirst({ where: { manifestId: nextManifestId, category: nextCategory, id: { not: existing.id } } });
        if (conflict) return res.status(409).json({ error: `This manifest already has a ${PARTY_INVOICE_CATEGORY_LABELS[nextCategory]} invoice (${conflict.invoiceNumber}).` });
      }
    }

    const amountNum = amount !== undefined ? Number(amount) : Number(existing.amount);
    const gstNum = gstPercent !== undefined ? Number(gstPercent) || 0 : Number(existing.gstPercent);
    if (amount !== undefined || gstPercent !== undefined) {
      data.amount = amountNum;
      data.gstPercent = gstNum;
      data.totalAmount = Math.round((amountNum + (amountNum * gstNum) / 100) * 100) / 100;
    }

    const invoice = await prisma.partyInvoice.update({ where: { id: req.params.id }, data });
    const { fileName } = await generatePartyInvoicePdf(invoice);
    const updated = await prisma.partyInvoice.update({ where: { id: invoice.id }, data: { pdfFileUrl: fileName } });

    res.json({ invoice: toInvoiceResponse(updated) });
  } catch (err) {
    next(err);
  }
}

// Non-CUSTOMER roles are who salaries actually get paid to — mirrors
// listDrivers' shape (id/fullName/email/role, nothing sensitive) for the
// Payable tab's "Salary payment" employee picker.
async function listStaffForSalary(req, res, next) {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'STAFF', 'ACCOUNTS', 'DRIVER'] }, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    res.json({ staff });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/party-invoices/salary — { employeeUserId, amount,
 * month (YYYY-MM), dueDate } — the Payable tab's salary quick-add: picks
 * a staff member instead of typing a party name, and tags the invoice
 * category SALARY so it groups separately from the manifest cost
 * categories in the Accounts Overview cost breakdown. Plain PartyInvoice
 * creation under the hood (no manifestId — salaries are never
 * manifest-linked), reusing the same invoice-number sequence and PDF
 * generation as every other payable.
 */
async function createSalaryPayment(req, res, next) {
  try {
    const { employeeUserId, amount, month, dueDate, hubId } = req.body;
    if (!employeeUserId || !amount || !dueDate) {
      return res.status(400).json({ error: 'employeeUserId, amount and dueDate are required' });
    }
    const employee = await prisma.user.findUnique({ where: { id: employeeUserId } });
    if (!employee) return res.status(404).json({ error: 'Staff member not found' });

    const amountNum = Number(amount);
    const invoiceNumber = await generatePartyInvoiceNumber('PAYABLE');
    const monthLabel = month ? new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;

    const invoice = await prisma.partyInvoice.create({
      data: {
        direction: 'PAYABLE',
        invoiceNumber,
        partyName: employee.fullName,
        businessName: employee.email,
        description: monthLabel ? `Salary — ${monthLabel}` : 'Salary payment',
        amount: amountNum,
        gstPercent: 0,
        totalAmount: amountNum,
        dueDate: new Date(dueDate),
        status: 'UNPAID',
        category: 'SALARY',
        // No manifest for a salary — this is exactly the case
        // PartyInvoice.hubId exists for: a direct branch tag instead of
        // the per-order weight split manifest-linked costs use (see
        // admin.controller.js's computeBranchCosts).
        hubId: hubId || null,
        createdById: req.user.id,
      },
    });
    const { fileName } = await generatePartyInvoicePdf(invoice);
    const updated = await prisma.partyInvoice.update({ where: { id: invoice.id }, data: { pdfFileUrl: fileName } });

    res.status(201).json({ invoice: toInvoiceResponse(updated) });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/party-invoices/:id/status */
async function updateInvoiceStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['PAID', 'UNPAID'].includes(status)) return res.status(400).json({ error: 'status must be PAID or UNPAID' });

    const invoice = await prisma.partyInvoice.update({
      where: { id: req.params.id },
      data: { status, paidAt: status === 'PAID' ? new Date() : null },
    });

    await prisma.partyInvoiceComment.create({
      data: {
        invoiceId: invoice.id,
        authorId: req.user.id,
        body: status === 'PAID' ? 'Invoice marked as paid.' : 'Invoice marked as unpaid.',
      },
    });

    res.json({ invoice: toInvoiceResponse(invoice) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/party-invoices/:id/send — emails the PDF (+ attachment if any) to invoice.email. */
async function sendInvoiceEmail(req, res, next) {
  try {
    const invoice = await prisma.partyInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.email) return res.status(400).json({ error: 'This invoice has no email address on file' });

    const filePath = path.join(STORAGE_DIR, invoice.pdfFileUrl || `${invoice.invoiceNumber}.pdf`);
    if (!fs.existsSync(filePath)) await generatePartyInvoicePdf(invoice);

    const attachments = [
      { filename: `${invoice.invoiceNumber}.pdf`, content: fs.readFileSync(filePath).toString('base64') },
    ];
    if (invoice.attachmentData) {
      attachments.push({ filename: invoice.attachmentName || 'attachment', content: invoice.attachmentData.toString('base64') });
    }

    const label = invoice.direction === 'PAYABLE' ? 'Payable' : 'Receivable';
    await sendEmail({
      to: invoice.email,
      subject: `${label} Invoice ${invoice.invoiceNumber} from Comonn International Courier`,
      html: `<p>Hi ${invoice.partyName},</p><p>Please find attached invoice <b>${invoice.invoiceNumber}</b> for <b>Rs. ${Number(invoice.totalAmount).toFixed(2)}</b>, due ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}.</p><p>${invoice.description}</p>`,
      attachments,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/party-invoices/:id/download */
async function downloadInvoicePdf(req, res, next) {
  try {
    const invoice = await prisma.partyInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const filePath = path.resolve(path.join(STORAGE_DIR, invoice.pdfFileUrl || `${invoice.invoiceNumber}.pdf`));
    if (!fs.existsSync(filePath)) await generatePartyInvoicePdf(invoice);
    if (req.query.inline) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return res.sendFile(filePath);
    }
    res.download(filePath);
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/party-invoices/:id/attachment */
async function downloadInvoiceAttachment(req, res, next) {
  try {
    const invoice = await prisma.partyInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.attachmentData) return res.status(404).json({ error: 'No attachment on this invoice' });
    res.setHeader('Content-Type', invoice.attachmentMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.attachmentName || 'attachment'}"`);
    res.send(invoice.attachmentData);
  } catch (err) {
    next(err);
  }
}

/** GET/POST /api/admin/party-invoices/:id/comments */
const { listComments: listInvoiceComments, addComment: addInvoiceComment } = makeCommentHandlers({
  commentModel: 'partyInvoiceComment',
  parentModel: 'partyInvoice',
  fkField: 'invoiceId',
  notFoundError: 'Invoice not found',
});

module.exports = {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  updateInvoiceStatus,
  sendInvoiceEmail,
  downloadInvoicePdf,
  downloadInvoiceAttachment,
  listInvoiceComments,
  addInvoiceComment,
  listStaffForSalary,
  createSalaryPayment,
};
