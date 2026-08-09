const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateLabelPdf, STORAGE_DIR } = require('../services/labelService');
const { generateInvoicePdf } = require('../services/invoiceService');
const { sendEmail } = require('../services/emailService');
const { ensureCustomerAccount } = require('../services/accountProvisioning');
const { getCountryName } = require('../utils/countryNames');

function siteUrl(pathname) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}${pathname}`;
}

// Mirrors the quote email / booking confirmation card layout (see
// renderQuoteEmailHtml in quote.controller.js and renderBookingConfirmationHtml
// below) — rounded white cards on a paper background, a top-right status
// pill, a two-column info table. Shows the receiver their own delivery
// details exactly as the sender entered them (name/phone/email/address) so
// they can flag anything wrong before it ships, plus who it's coming from
// and what's in it.
function renderReceiverNotificationHtml(order) {
  const sender = order.senderAddress;
  const receiver = order.receiverAddress;
  const trackUrl = siteUrl(`/track?id=${encodeURIComponent(order.trackingNumber || '')}`);

  const itemRows = Array.isArray(order.items) && order.items.length
    ? order.items
        .map(
          (it) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #EDEAE2;font-size:13px;">${it.itemType} x${it.quantity}</td><td style="padding:6px 10px;border-bottom:1px solid #EDEAE2;font-size:13px;">${it.lengthCm && it.widthCm && it.heightCm ? `${it.lengthCm}×${it.widthCm}×${it.heightCm} cm` : '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #EDEAE2;font-size:13px;">${it.actualWeightKg ? `${it.actualWeightKg} kg each` : 'Weighed at pickup'}</td></tr>`
        )
        .join('')
    : '';

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;background:#F7F5F0;padding:22px;">
      <div style="background:#fff;border-radius:14px;padding:22px;border:1px solid #E7E3DA;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="font-size:17px;font-weight:700;color:#171C2C;">A parcel has been booked for you</td>
            <td style="text-align:right;">
              <span style="background:#EAF0FF;color:#2451FF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;">On its way</span>
            </td>
          </tr>
        </table>
        <p style="font-size:13.5px;color:#5B6478;line-height:1.6;margin:0 0 14px;">Hi ${receiver?.contactName || ''}, ${sender?.contactName || 'someone'} has booked a shipment to you via Comonn. Here are the details on file:</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:10px;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Order</div>
              <div style="font-size:14px;font-weight:600;">${order.orderNumber}</div>
            </td>
            <td style="width:50%;vertical-align:top;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Tracking</div>
              <div style="font-size:14px;font-weight:600;">${order.trackingNumber || 'Assigned at pickup'}</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#fff;border-radius:14px;padding:20px 22px;margin-top:16px;border:1px solid #E7E3DA;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:10px;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">From</div>
              ${addressBlockHtml(sender)}
            </td>
            <td style="width:50%;vertical-align:top;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Your delivery details</div>
              ${addressBlockHtml(receiver)}
            </td>
          </tr>
        </table>
      </div>

      ${itemRows ? `
      <div style="background:#fff;border-radius:14px;padding:18px 22px;margin-top:16px;border:1px solid #E7E3DA;">
        <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">What's being shipped</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="text-align:left;color:#8A93A6;font-size:11px;text-transform:uppercase;">
            <th style="padding:0 10px 6px;">Item</th><th style="padding:0 10px 6px;">Dimensions</th><th style="padding:0 10px 6px;">Weight</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>` : ''}

      <div style="background:#fff;border-radius:14px;padding:18px 22px;margin-top:16px;border:1px solid #E7E3DA;">
        <p style="font-size:13.5px;color:#5B6478;line-height:1.6;margin:0;">
          If any of your details above are incorrect, reply to this email or contact us before the parcel ships so we can update them.
        </p>
      </div>

      <a href="${trackUrl}" style="display:block;text-align:center;margin-top:18px;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:15px;">Track order →</a>

      <p style="font-size:12px;color:#8A93A6;text-align:center;margin-top:16px;">Questions about this shipment? Email us at support@comonn.in.</p>
    </div>
  `;
}

async function sendReceiverBookingNotification(order) {
  const to = order.receiverAddress?.email;
  if (!to) return;
  try {
    await sendEmail({
      to,
      from: process.env.EMAIL_FROM_ALERTS || 'Comonn Alerts <alerts@comonn.in>',
      subject: `A parcel is on its way to you — Order ${order.orderNumber}`,
      html: renderReceiverNotificationHtml(order),
    });
  } catch (err) {
    console.error('sendReceiverBookingNotification failed:', err.message);
  }
}

function toLabelResponse(label) {
  // Relative to the API base URL (which already includes /api) — the
  // frontend prepends VITE_API_BASE_URL, so this must NOT also start with /api.
  return { ...label, downloadUrl: `/labels/download/${label.id}` };
}

function toInvoiceResponse(invoice) {
  return invoice ? { ...invoice, downloadUrl: `/labels/invoice/download/${invoice.orderId}` } : null;
}

async function ensureInvoice(order) {
  const existing = await prisma.invoice.findUnique({ where: { orderId: order.id } });
  if (existing) {
    // Label/invoice PDFs live on local disk, which doesn't persist across
    // backend redeploys — regenerate (same deterministic filename) if the
    // file has gone missing rather than trusting the DB row blindly.
    if (!fs.existsSync(path.join(STORAGE_DIR, existing.fileUrl))) {
      await generateInvoicePdf(order);
    }
    return existing;
  }

  const { fileName } = await generateInvoicePdf(order);
  return prisma.invoice.create({ data: { orderId: order.id, fileUrl: fileName } });
}

/**
 * Forces the invoice PDF to be regenerated with the order's current
 * pricing, if one already exists — called from updateOrderDetails
 * (order.controller.js) after a staff edit changes an already-invoiced
 * order's price. Unlike ensureInvoice, this doesn't check whether the file
 * is missing first — the DB row's fileUrl/filename stay the same
 * (deterministic, keyed by orderNumber), only the PDF content changes, so
 * no new Invoice row or fileUrl is needed.
 */
async function regenerateInvoiceIfExists(order) {
  const existing = await prisma.invoice.findUnique({ where: { orderId: order.id } });
  if (!existing) return null;
  await generateInvoicePdf(order);
  return existing;
}

// One "package" entry per unit of quantity, across all items — same order
// every time (derived purely from order.items), so package N always maps
// to the same label regardless of when it's (re)computed.
function buildPackages(order) {
  const packages = [];
  for (const item of order.items) {
    for (let i = 0; i < item.quantity; i++) packages.push(item);
  }
  return packages;
}

async function emailLabelsAndInvoice(order, labels, invoice) {
  if (!order.otpEmail) return;
  try {
    const attachments = [
      ...labels.map((l) => ({
        filename: l.fileUrl,
        content: fs.readFileSync(path.join(STORAGE_DIR, l.fileUrl)).toString('base64'),
      })),
      {
        filename: invoice.fileUrl,
        content: fs.readFileSync(path.join(STORAGE_DIR, invoice.fileUrl)).toString('base64'),
      },
    ];
    await sendEmail({
      to: order.otpEmail,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: `Your Comonn shipping label${labels.length > 1 ? 's' : ''} and invoice — Order ${order.orderNumber}`,
      html: `
        <p>Your shipping label${labels.length > 1 ? 's are' : ' is'} attached for order ${order.orderNumber}, along with your invoice. Print the label(s) and attach one to each package before pickup.</p>
      `,
      attachments,
    });
  } catch (err) {
    // Labels/invoice are already generated and downloadable — a failed
    // email shouldn't fail the whole request.
    console.error('emailLabelsAndInvoice failed:', err.message);
  }
}

function addressBlockHtml(addr) {
  if (!addr) return '';
  const lines = [
    addr.line1,
    addr.line2,
    `${addr.city || ''}${addr.state ? ', ' + addr.state : ''} ${addr.postcode || ''}`.trim(),
    getCountryName(addr.countryCode),
  ].filter(Boolean);
  return `
    <p style="margin:0 0 2px;font-size:13.5px;"><b>${addr.contactName || ''}</b></p>
    <p style="margin:0 0 2px;font-size:13px;color:#5B6478;">${addr.phone || ''}${addr.email ? ` · ${addr.email}` : ''}</p>
    <p style="margin:0;font-size:13px;color:#5B6478;">${lines.join(', ')}</p>
  `;
}

// Mirrors the quote email's card layout (renderQuoteEmailHtml in
// quote.controller.js) — rounded white cards on a paper background, a
// top-right status pill, and a two-column info table — so every
// transactional email reads as one visual system.
function renderBookingConfirmationHtml(order) {
  const sender = order.senderAddress;
  const receiver = order.receiverAddress;
  const trackUrl = siteUrl(`/track?id=${encodeURIComponent(order.trackingNumber || '')}`);

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;background:#F7F5F0;padding:22px;">
      <div style="background:#fff;border-radius:14px;padding:22px;border:1px solid #E7E3DA;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="font-size:17px;font-weight:700;color:#171C2C;">Booking confirmed</td>
            <td style="text-align:right;">
              <span style="background:#E9F9EE;color:#1E8E3E;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;">✓ Confirmed</span>
            </td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:10px;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Order</div>
              <div style="font-size:14px;font-weight:600;">${order.orderNumber}</div>
            </td>
            <td style="width:50%;vertical-align:top;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Tracking</div>
              <div style="font-size:14px;font-weight:600;">${order.trackingNumber}</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#fff;border-radius:14px;padding:20px 22px;margin-top:16px;border:1px solid #E7E3DA;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:10px;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Sender</div>
              ${addressBlockHtml(sender)}
            </td>
            <td style="width:50%;vertical-align:top;">
              <div style="font-size:11px;color:#8A93A6;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Receiver</div>
              ${addressBlockHtml(receiver)}
            </td>
          </tr>
        </table>
      </div>

      <div style="background:#fff;border-radius:14px;padding:18px 22px;margin-top:16px;border:1px solid #E7E3DA;">
        <p style="font-size:13.5px;color:#5B6478;line-height:1.6;margin:0;">
          Since the weight wasn't known at booking, our courier will weigh and measure your shipment in person${order.pickupDate ? ` at pickup on <b>${order.pickupDate}</b>` : ' at pickup'}, confirm the final price, and collect payment in cash. Shipping labels will be printed and attached by the courier at that time.
        </p>
      </div>

      <a href="${trackUrl}" style="display:block;text-align:center;margin-top:18px;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:15px;">Track order →</a>

      <p style="font-size:12px;color:#8A93A6;text-align:center;margin-top:16px;">Questions about your pickup? Reply to this email or contact us at support@comonn.in.</p>
    </div>
  `;
}

async function sendBookingConfirmationEmail(order, to) {
  try {
    await sendEmail({
      to,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: `Booking confirmed — Order ${order.orderNumber}`,
      html: renderBookingConfirmationHtml(order),
    });
  } catch (err) {
    console.error('sendBookingConfirmationEmail failed:', err.message);
  }
}

/**
 * POST /api/labels/:orderId/generate
 * Step 4 ("Print Labels"): only allowed once the order is PAID. Generates
 * one PDF label per physical package (sum of each OrderItem's quantity),
 * each with its own Code128 barcode, all linked back to the order's
 * tracking number — plus a single invoice PDF for the whole order.
 */
async function generateLabel(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        service: true,
        senderAddress: true,
        receiverAddress: true,
        labels: true,
        items: true,
        addons: true,
        payment: true,
        user: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (['DRAFT', 'UNFINISHED', 'PENDING_PAYMENT'].includes(order.status)) {
      return res.status(409).json({ error: 'Order must be paid before a label can be generated' });
    }

    // "Not sure, book pickup": weight/price unknown, so there's nothing to
    // print a label or invoice for yet — send a booking-confirmation email
    // to the sender instead. The receiver alert is deliberately NOT sent
    // here — for these cash-collected pickup orders it only goes out once
    // payment is actually confirmed (see markOrderPaid / updateOrderStatus),
    // not at initial booking time. confirmationEmailSentAt guards against
    // resending the sender email on page reload (these orders never get a
    // Label row, so the labels.length check below doesn't apply to them).
    if (order.pricingPending) {
      const emailedTo = order.senderAddress?.email || order.otpEmail || null;
      // Kept separate from the confirmationEmailSentAt-guarded block below:
      // that guard is only about not re-sending the one-time confirmation
      // email, but ensureCustomerAccount is idempotent (a no-op once the
      // order is correctly linked to a real CUSTOMER account) and needs to
      // keep running on every visit — otherwise an order that was first
      // opened before its ADMIN/STAFF-booked userId got corrected (see
      // createOrder) would stay stuck showing the wrong account's
      // hasPassword forever, since the email would already be marked sent.
      const accountInfo = await ensureCustomerAccount(order);
      const accountUser = accountInfo?.user || order.user;
      if (!order.confirmationEmailSentAt && emailedTo) {
        // Still creates/links the guest's account (needed for the Labels
        // page's "Set up my password" button and the delayed account-setup
        // follow-up email) — just no longer embeds account-creation details
        // in this confirmation email itself.
        await sendBookingConfirmationEmail(order, emailedTo);
        await prisma.order.update({ where: { id: order.id }, data: { confirmationEmailSentAt: new Date() } });
      }
      return res.json({ pricingPending: true, emailedTo, hasPassword: Boolean(accountUser?.passwordSetAt) });
    }

    if (order.labels.length > 0) {
      const invoice = await ensureInvoice(order);
      // Same disk-doesn't-persist-across-redeploys issue as ensureInvoice —
      // regenerate any label whose PDF file has gone missing.
      const existingPackages = buildPackages(order);
      const existingTotalPackages = existingPackages.length || 1;
      for (const label of order.labels) {
        if (!fs.existsSync(path.join(STORAGE_DIR, label.fileUrl))) {
          await generateLabelPdf(order, {
            packageIndex: label.packageIndex,
            totalPackages: existingTotalPackages,
            item: existingPackages[label.packageIndex - 1] || existingPackages[0],
            barcodeValue: label.barcodeValue,
          });
        }
      }
      // Idempotent no-op once order.userId is correctly linked to a real
      // CUSTOMER account — kept here (not just in the fresh-generation
      // branch below) so an order whose labels were generated before that
      // link was corrected (see createOrder) gets repaired on the next
      // visit instead of reading the stale account forever.
      const accountInfo = await ensureCustomerAccount(order);
      const accountUser = accountInfo?.user || order.user;
      return res.json({
        labels: order.labels.map(toLabelResponse),
        invoice: toInvoiceResponse(invoice),
        emailedTo: order.otpEmail || null,
        hasPassword: Boolean(accountUser?.passwordSetAt),
      });
    }

    const packages = buildPackages(order);
    const totalPackages = packages.length || 1;

    const labels = [];
    for (let i = 0; i < packages.length; i++) {
      const packageIndex = i + 1;
      const barcodeValue = totalPackages > 1 ? `${order.trackingNumber}-${packageIndex}` : order.trackingNumber;
      const { fileName } = await generateLabelPdf(order, {
        packageIndex,
        totalPackages,
        item: packages[i],
        barcodeValue,
      });
      const label = await prisma.label.create({
        data: {
          orderId: order.id,
          packageIndex,
          itemType: packages[i].itemType,
          fileUrl: fileName,
          barcodeValue,
        },
      });
      labels.push(label);
    }

    const invoice = await ensureInvoice(order);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'LABEL_GENERATED',
        trackingEvents: { create: { status: 'LABEL_GENERATED', note: `${totalPackages} shipping label(s) and invoice generated` } },
      },
    });

    // Still creates/links the guest's account (needed for the Labels page's
    // "Set up my password" button and the delayed account-setup follow-up
    // email) — just no longer embeds account-creation details in this
    // labels/invoice email itself.
    const accountInfo = await ensureCustomerAccount(order);
    await emailLabelsAndInvoice(order, labels, invoice);
    await sendReceiverBookingNotification(order);

    res.status(201).json({
      labels: labels.map(toLabelResponse),
      invoice: toInvoiceResponse(invoice),
      emailedTo: order.otpEmail || null,
      hasPassword: Boolean(accountInfo?.user?.passwordSetAt),
    });
  } catch (err) {
    next(err);
  }
}

// Shared by every "serve this label's PDF" entry point (by id, by barcode).
// `?inline=1` opens it in the browser tab instead of forcing a download —
// used by the admin/staff Bookings "View label" button and the Print
// Label panel.
async function serveLabelFile(label, req, res) {
  const filePath = path.resolve(path.join(STORAGE_DIR, label.fileUrl));
  // Local disk doesn't persist across backend redeploys — regenerate on
  // the fly (same deterministic filename) if the file has gone missing.
  if (!fs.existsSync(filePath)) {
    const order = await prisma.order.findUnique({
      where: { id: label.orderId },
      include: { items: true, service: true, senderAddress: true, receiverAddress: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const packages = buildPackages(order);
    const totalPackages = packages.length || 1;
    await generateLabelPdf(order, {
      packageIndex: label.packageIndex,
      totalPackages,
      item: packages[label.packageIndex - 1] || packages[0],
      barcodeValue: label.barcodeValue,
    });
  }
  if (req.query.inline) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    return res.sendFile(filePath);
  }
  res.download(filePath);
}

/** GET /api/labels/download/:labelId — streams a label PDF by its internal id. */
async function downloadLabel(req, res, next) {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    await serveLabelFile(label, req, res);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/labels/download/barcode/:barcodeValue — streams a label PDF by
 * its printed barcode value, for the admin/staff Print Label panel (staff
 * enter or scan a label's barcode to reprint it without hunting down the
 * order first).
 */
async function downloadLabelByBarcode(req, res, next) {
  try {
    const label = await prisma.label.findUnique({ where: { barcodeValue: req.params.barcodeValue.trim() } });
    if (!label) return res.status(404).json({ error: 'No label found for this barcode' });
    await serveLabelFile(label, req, res);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/labels/invoice/download/:orderId — streams the invoice PDF.
 * `?inline=1` (used by the admin/staff Bookings "View invoice" button) opens
 * it in the browser tab instead of forcing a download.
 */
async function downloadInvoice(req, res, next) {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { orderId: req.params.orderId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const filePath = path.resolve(path.join(STORAGE_DIR, invoice.fileUrl));
    // Local disk doesn't persist across backend redeploys — regenerate on
    // the fly (same deterministic filename) if the file has gone missing.
    if (!fs.existsSync(filePath)) {
      const order = await prisma.order.findUnique({
        where: { id: invoice.orderId },
        include: { senderAddress: true, receiverAddress: true, service: true, addons: true, payment: true },
      });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      await generateInvoicePdf(order);
    }
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

module.exports = { generateLabel, downloadLabel, downloadLabelByBarcode, downloadInvoice, sendReceiverBookingNotification, regenerateInvoiceIfExists };
