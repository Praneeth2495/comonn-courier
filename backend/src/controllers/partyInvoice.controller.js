const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { prisma } = require('../config/db');
const { generatePartyInvoiceNumber } = require('../utils/invoiceNumber');
const { generatePartyInvoicePdf, STORAGE_DIR } = require('../services/partyInvoicePdf');
const { advance } = require('../services/partyInvoiceRecurrence');
const { sendEmail } = require('../services/emailService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('attachment');

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
      const { direction, partyName, businessName, description, amount, gstPercent, dueDate, email, phone, recurrence, status } = req.body;

      if (!['RECEIVABLE', 'PAYABLE'].includes(direction)) {
        return res.status(400).json({ error: 'direction must be RECEIVABLE or PAYABLE' });
      }
      if (!partyName?.trim() || !description?.trim() || !amount || !dueDate) {
        return res.status(400).json({ error: 'partyName, description, amount and dueDate are required' });
      }
      const recurrenceValue = ['WEEKLY', 'MONTHLY', 'YEARLY'].includes(recurrence) ? recurrence : 'NONE';
      const statusValue = status === 'PAID' ? 'PAID' : 'UNPAID';

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

/** GET /api/admin/party-invoices/:id/comments */
async function listInvoiceComments(req, res, next) {
  try {
    const comments = await prisma.partyInvoiceComment.findMany({
      where: { invoiceId: req.params.id },
      include: { author: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ comments });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/party-invoices/:id/comments */
async function addInvoiceComment(req, res, next) {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

    const invoice = await prisma.partyInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const comment = await prisma.partyInvoiceComment.create({
      data: { invoiceId: invoice.id, authorId: req.user.id, body: body.trim() },
      include: { author: { select: { fullName: true, email: true } } },
    });
    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  sendInvoiceEmail,
  downloadInvoicePdf,
  downloadInvoiceAttachment,
  listInvoiceComments,
  addInvoiceComment,
};
