const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html, from }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from || process.env.EMAIL_FROM || 'Comonn <quotes@comonn.in>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Resend API error (${res.status}): ${body}`);
    err.status = 502;
    throw err;
  }

  return res.json();
}

module.exports = { sendEmail };
