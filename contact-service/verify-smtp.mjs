import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT ?? 465);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

await transporter.verify();
console.log("SMTP authentication verified.");
