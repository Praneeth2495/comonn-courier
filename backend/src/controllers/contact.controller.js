const { sendEmail } = require('../services/emailService');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** POST /api/contact — "Talk to us" form on the Services page. */
async function sendContactMessage(req, res, next) {
  try {
    const subject = (req.body.subject || '').trim();
    const description = (req.body.description || '').trim();
    const email = (req.body.email || '').trim();
    const phone = (req.body.phone || '').trim();
    if (!subject || !description || !email || !phone) {
      return res.status(400).json({ error: 'Subject, description, email and mobile are all required.' });
    }

    await sendEmail({
      to: 'support@comonn.in',
      subject: `[Talk to us] ${subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;color:#171C2C;">
          <p><b>From:</b> ${escapeHtml(email)}</p>
          <p><b>Mobile:</b> ${escapeHtml(phone)}</p>
          <p><b>Subject:</b> ${escapeHtml(subject)}</p>
          <p><b>Description:</b></p>
          <p style="white-space:pre-wrap;">${escapeHtml(description)}</p>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendContactMessage };
