import nodemailer from "nodemailer";

export const runtime = "nodejs";

const enquiryTypes = new Set([
  "Corporate enquiry",
  "Dealer or distributor enquiry",
  "Customer care",
  "Other business enquiry",
]);

type ContactPayload = {
  name?: unknown;
  organisation?: unknown;
  email?: unknown;
  phone?: unknown;
  type?: unknown;
  message?: unknown;
  consent?: unknown;
  website?: unknown;
};

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function emailShell(content: string) {
  return `<!doctype html>
  <html lang="en"><body style="margin:0;background:#f6f1e8;font-family:Arial,sans-serif;color:#211d19">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1e8;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;overflow:hidden;background:#fff;border:1px solid #e5ddd1;border-radius:8px">
          <tr><td style="height:5px;background:linear-gradient(90deg,#ef1e2b,#d6a63b)"></td></tr>
          <tr><td style="padding:28px 32px 10px"><div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#171513">ESKAY</div><div style="margin-top:5px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#b51119">Experience · Knowledge · Evolution</div></td></tr>
          <tr><td style="padding:18px 32px 34px">${content}</td></tr>
          <tr><td style="padding:18px 32px;background:#171513;color:#aaa39b;font-size:11px;line-height:1.6">This is an automated message from the ESKAY corporate website.</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 20_000) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let payload: ContactPayload;
  try {
    payload = await request.json() as ContactPayload;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (clean(payload.website, 200)) {
    return Response.json({ ok: true });
  }

  const name = clean(payload.name, 100);
  const organisation = clean(payload.organisation, 120);
  const email = clean(payload.email, 254).toLowerCase();
  const phone = clean(payload.phone, 40);
  const enquiryType = clean(payload.type, 80);
  const message = clean(payload.message, 3000);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (
    name.length < 2 ||
    !emailIsValid ||
    !enquiryTypes.has(enquiryType) ||
    message.length < 10 ||
    payload.consent !== true
  ) {
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const adminEmail = process.env.ADMIN_EMAIL ?? user;

  if (!host || !user || !pass || !adminEmail || !Number.isFinite(port)) {
    console.error("Contact form SMTP configuration is incomplete.");
    return Response.json({ error: "Mail service is temporarily unavailable." }, { status: 503 });
  }

  const safeName = escapeHtml(name);
  const safeOrganisation = escapeHtml(organisation || "Not provided");
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || "Not provided");
  const safeType = escapeHtml(enquiryType);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await Promise.all([
      transporter.sendMail({
        from: `"ESKAY Website" <${user}>`,
        to: adminEmail,
        replyTo: email,
        subject: `[ESKAY Website] ${enquiryType} — ${name.replace(/[\r\n]/g, " ")}`,
        text: `New ESKAY website enquiry\n\nName: ${name}\nOrganisation: ${organisation || "Not provided"}\nEmail: ${email}\nPhone: ${phone || "Not provided"}\nEnquiry type: ${enquiryType}\n\nMessage:\n${message}`,
        html: emailShell(`
          <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:28px">New website enquiry</h1>
          <p style="margin:0 0 24px;color:#6a635c;font-size:14px">A new message was submitted through the ESKAY contact form.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6">
            <tr><td style="padding:8px 0;color:#7b736b;width:135px">Name</td><td style="padding:8px 0;font-weight:700">${safeName}</td></tr>
            <tr><td style="padding:8px 0;color:#7b736b">Organisation</td><td style="padding:8px 0">${safeOrganisation}</td></tr>
            <tr><td style="padding:8px 0;color:#7b736b">Email</td><td style="padding:8px 0"><a href="mailto:${safeEmail}" style="color:#b51119">${safeEmail}</a></td></tr>
            <tr><td style="padding:8px 0;color:#7b736b">Phone</td><td style="padding:8px 0">${safePhone}</td></tr>
            <tr><td style="padding:8px 0;color:#7b736b">Enquiry type</td><td style="padding:8px 0">${safeType}</td></tr>
          </table>
          <div style="margin-top:22px;padding:18px;border-left:3px solid #d6a63b;background:#faf7f1;font-size:14px;line-height:1.7">${safeMessage}</div>
        `),
      }),
      transporter.sendMail({
        from: `"ESKAY" <${user}>`,
        to: email,
        replyTo: adminEmail,
        subject: "We received your enquiry | ESKAY",
        text: `Dear ${name},\n\nThank you for contacting ESKAY. We have received your ${enquiryType.toLowerCase()} and it has been directed to the appropriate team.\n\nWe will respond using the contact details you provided.\n\nRegards,\nESKAY`,
        html: emailShell(`
          <p style="margin:0 0 8px;color:#b51119;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Enquiry received</p>
          <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px">Thank you, ${safeName}.</h1>
          <p style="margin:0 0 14px;color:#5f5852;font-size:15px;line-height:1.7">We have received your <strong>${safeType.toLowerCase()}</strong> and directed it to the appropriate ESKAY team.</p>
          <p style="margin:0;color:#5f5852;font-size:15px;line-height:1.7">We will respond using the contact details you provided.</p>
        `),
      }),
    ]);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to send contact form email:", error);
    return Response.json({ error: "We could not send your enquiry. Please try again shortly." }, { status: 502 });
  }
}
