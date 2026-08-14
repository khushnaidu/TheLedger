const nodemailer = require('nodemailer');

// Gmail SMTP — needs GMAIL_USER + GMAIL_APP_PASSWORD (a Google "app password",
// not the account password). Without them we log the email to the console so
// the flow still works in local dev.
function getTransport() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const transport = getTransport();
  if (!transport) {
    console.log(`[mailer] GMAIL_USER/GMAIL_APP_PASSWORD not set — reset link for ${to}: ${resetUrl}`);
    return;
  }

  await transport.sendMail({
    from: `"The Ledger" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'The Ledger — password reset',
    text: [
      `Dear ${name},`,
      '',
      'A password reset was requested for your account at The Ledger.',
      'Follow this link within the hour to file a new one:',
      '',
      resetUrl,
      '',
      'If you did not request this, disregard — your ledger remains sealed.',
      '',
      '— The Bureau of Records',
    ].join('\n'),
  });
}

module.exports = { sendPasswordResetEmail };
