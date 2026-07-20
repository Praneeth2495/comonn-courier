const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateLabelPdf, STORAGE_DIR } = require('../services/labelService');
const { generateInvoicePdf } = require('../services/invoiceService');
const { sendEmail } = require('../services/emailService');
const { ensureCustomerAccount, passwordSetUrl } = require('../services/accountProvisioning');

function siteUrl(pathname) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}${pathname}`;
}

function accountBlockHtml(accountInfo) {
  if (!accountInfo?.isNewAccount) return '';
  return `
    <div style="margin-top:24px;padding:18px 20px;background:#F2F6FF;border-radius:12px;">
      <p style="margin:0 0 8px;font-weight:700;color:#0E1B3D;font-size:14.5px;">We've created an account for you!</p>
      <p style="margin:0 0 10px;font-size:13px;color:#5B6478;line-height:1.6;">To make managing your international shipments easier, we've set up a private customer portal for you. Use it to track packages live, download labels and invoices, and manage your saved addresses.</p>
      <p style="margin:0 0 4px;font-size:13px;"><b>Username:</b> ${accountInfo.user.email}</p>
      <p style="margin:0 0 14px;font-size:13px;"><b>Password:</b> Not set yet — for your security</p>
      <p style="margin:0 0 6px;"><a href="${passwordSetUrl(accountInfo.rawToken)}" style="background:#FF5A36;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13.5px;display:inline-block;">Set your password →</a></p>
      <p style="margin:10px 0 0;font-size:11.5px;color:#8A93A6;">This secure link expires in 24 hours. If it expires, just visit our login page and click &quot;Forgot password?&quot; to receive a new one.</p>
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
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
          <h2 style="color:#0E1B3D;margin-bottom:6px;">A parcel has been booked for you</h2>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Hi ${order.receiverAddress?.contactName || ''},</p>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">${order.senderAddress?.contactName || 'Someone'} has booked a shipment to you via COMONN. Here are the details:</p>
          <div style="background:#F7F5F0;border-radius:12px;padding:14px 16px;margin:16px 0;">
            <p style="margin:0 0 4px;font-size:13px;"><b>Order number:</b> ${order.orderNumber}</p>
            ${order.trackingNumber ? `<p style="margin:0;font-size:13px;"><b>Tracking number:</b> ${order.trackingNumber}</p>` : ''}
          </div>
          <p style="margin:22px 0;"><a href="${siteUrl(`/track?id=${encodeURIComponent(order.trackingNumber || '')}`)}" style="background:#FF5A36;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Track order →</a></p>
          <p style="font-size:12px;color:#8A93A6;">Questions about this shipment? Email us at support@comonn.in.</p>
        </div>
      `,
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
  if (existing) return existing;

  const { fileName } = await generateInvoicePdf(order);
  return prisma.invoice.create({ data: { orderId: order.id, fileUrl: fileName } });
}

async function emailLabelsAndInvoice(order, labels, invoice, accountInfo) {
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
      subject: accountInfo?.isNewAccount
        ? `Confirmed: Order #${order.orderNumber} + Your Account Details`
        : `Your Comonn shipping label${labels.length > 1 ? 's' : ''} and invoice — Order ${order.orderNumber}`,
      html: `
        <p>Your shipping label${labels.length > 1 ? 's are' : ' is'} attached for order ${order.orderNumber}, along with your invoice. Print the label(s) and attach one to each package before pickup.</p>
        ${accountBlockHtml(accountInfo)}
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
    addr.countryCode,
  ].filter(Boolean);
  return `
    <p style="margin:0 0 2px;font-size:13.5px;"><b>${addr.contactName || ''}</b></p>
    <p style="margin:0 0 2px;font-size:13px;color:#5B6478;">${addr.phone || ''}${addr.email ? ` · ${addr.email}` : ''}</p>
    <p style="margin:0;font-size:13px;color:#5B6478;">${lines.join(', ')}</p>
  `;
}

function renderBookingConfirmationHtml(order, accountInfo) {
  const sender = order.senderAddress;
  const receiver = order.receiverAddress;
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;">
      <h2 style="color:#0E1B3D;margin-bottom:4px;">Booking confirmed</h2>
      <p style="color:#5B6478;font-size:13.5px;">Order <b>${order.orderNumber}</b> · Tracking <b>${order.trackingNumber}</b></p>

      <div style="margin-top:18px;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8A93A6;font-weight:600;">Sender</p>
        <div style="background:#F7F5F0;border-radius:12px;padding:14px 16px;">${addressBlockHtml(sender)}</div>
      </div>

      <div style="margin-top:14px;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8A93A6;font-weight:600;">Receiver</p>
        <div style="background:#F7F5F0;border-radius:12px;padding:14px 16px;">${addressBlockHtml(receiver)}</div>
      </div>

      <p style="font-size:13.5px;color:#5B6478;line-height:1.6;margin-top:20px;">
        Since the weight wasn't known at booking, our courier will weigh and measure your shipment in person${order.pickupDate ? ` at pickup on <b>${order.pickupDate}</b>` : ' at pickup'}, confirm the final price, and collect payment in cash. Shipping labels will be printed and attached by the courier at that time.
      </p>
      ${accountBlockHtml(accountInfo)}
      <p style="font-size:12px;color:#8A93A6;margin-top:20px;">Questions about your pickup? Reply to this email or contact us at support@comonn.in.</p>
    </div>
  `;
}

async function sendBookingConfirmationEmail(order, to, accountInfo) {
  try {
    await sendEmail({
      to,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: accountInfo?.isNewAccount
        ? `Confirmed: Order #${order.orderNumber} + Your Account Details`
        : `Booking confirmed — Order ${order.orderNumber}`,
      html: renderBookingConfirmationHtml(order, accountInfo),
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
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // "Not sure, book pickup": weight/price unknown, so there's nothing to
    // print a label or invoice for yet — send a booking-confirmation email
    // to the sender instead. confirmationEmailSentAt guards against
    // resending on page reload (these orders never get a Label row, so the
    // labels.length check below doesn't apply to them). Checked before the
    // DRAFT/PENDING_PAYMENT guard below: cash pickup bookings stay
    // PENDING_PAYMENT (cash isn't collected until pickup), so they'd
    // otherwise get incorrectly blocked as "unpaid" here.
    if (order.pricingPending) {
      const emailedTo = order.senderAddress?.email || order.otpEmail || null;
      if (!order.confirmationEmailSentAt && emailedTo) {
        const accountInfo = await ensureCustomerAccount(order);
        await sendBookingConfirmationEmail(order, emailedTo, accountInfo);
        await sendReceiverBookingNotification(order);
        await prisma.order.update({ where: { id: order.id }, data: { confirmationEmailSentAt: new Date() } });
      }
      return res.json({ pricingPending: true, emailedTo });
    }

    if (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT') {
      return res.status(409).json({ error: 'Order must be paid before a label can be generated' });
    }

    if (order.labels.length > 0) {
      const invoice = await ensureInvoice(order);
      return res.json({
        labels: order.labels.map(toLabelResponse),
        invoice: toInvoiceResponse(invoice),
        emailedTo: order.otpEmail || null,
      });
    }

    // One "package" entry per unit of quantity, across all items.
    const packages = [];
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) packages.push(item);
    }
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

    const accountInfo = await ensureCustomerAccount(order);
    await emailLabelsAndInvoice(order, labels, invoice, accountInfo);
    await sendReceiverBookingNotification(order);

    res.status(201).json({
      labels: labels.map(toLabelResponse),
      invoice: toInvoiceResponse(invoice),
      emailedTo: order.otpEmail || null,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/download/:labelId — streams a label PDF */
async function downloadLabel(req, res, next) {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    res.download(path.join(STORAGE_DIR, label.fileUrl));
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/invoice/download/:orderId — streams the invoice PDF */
async function downloadInvoice(req, res, next) {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { orderId: req.params.orderId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.download(path.join(STORAGE_DIR, invoice.fileUrl));
  } catch (err) {
    next(err);
  }
}

module.exports = { generateLabel, downloadLabel, downloadInvoice };
