// Sends the portal's notification emails. Without SMTP settings it only logs what it would have
// sent, so local runs and the test suite can never deliver real mail.
export async function createMailer(env) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return {
      enabled: false,
      async send({ to, subject }) {
        console.log("Email not sent (SMTP is not configured)", { to, subject });
      },
    };
  }
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(env.SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const from = env.MAIL_FROM || `"ESKAY Partner Portal" <${env.SMTP_USER}>`;
  return {
    enabled: true,
    async send({ to, subject, text, html }) {
      await transporter.sendMail({ from, to, subject, text, html });
    },
  };
}
