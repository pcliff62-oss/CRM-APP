import nodemailer from 'nodemailer';

export async function sendEmail(to: string, subject: string, text: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('Email skipped; SMTP env vars missing');
    return false;
  }
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  try {
    await transporter.sendMail({ from: user, to, subject, text });
    return true;
  } catch (e:any) {
    console.error('sendEmail failed', e?.message || e);
    return false;
  }
}