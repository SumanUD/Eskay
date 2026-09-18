import { createServer } from "node:http";
import nodemailer from "nodemailer";

const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "ADMIN_EMAIL"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 4110),
  origins: new Set((process.env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean)),
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  rateMax: Number(process.env.RATE_LIMIT_MAX ?? 5),
  rateBurst: Number(process.env.RATE_LIMIT_BURST ?? 40),
  rateWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
};
if (!config.origins.size || !Number.isInteger(config.port) || !Number.isInteger(config.smtpPort)) throw new Error("Invalid service configuration");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: config.smtpPort,
  secure: config.smtpPort === 465,
  requireTLS: config.smtpPort !== 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
const enquiryTypes = new Set(["Corporate enquiry", "Dealer or distributor enquiry", "Customer care", "Other business enquiry"]);
const attempts = new Map();

const clean = (value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const emailShell = (content) => `<!doctype html><html lang="en"><body style="margin:0;background:#f6f1e8;font-family:Arial,sans-serif;color:#211d19"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1e8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;overflow:hidden;background:#fff;border:1px solid #e5ddd1;border-radius:8px"><tr><td style="height:5px;background:linear-gradient(90deg,#ef1e2b,#d6a63b)"></td></tr><tr><td style="padding:28px 32px 10px"><div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#171513">ESKAY</div><div style="margin-top:5px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#b51119">Experience · Knowledge · Evolution</div></td></tr><tr><td style="padding:18px 32px 34px">${content}</td></tr><tr><td style="padding:18px 32px;background:#171513;color:#aaa39b;font-size:11px;line-height:1.6">This is an automated message from the ESKAY corporate website.</td></tr></table></td></tr></table></body></html>`;

function setCors(response, origin) {
  if (!config.origins.has(origin)) return;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
}
function json(response, status, payload, origin) {
  setCors(response, origin);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(payload));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; if (body.length > 16384) reject(new Error("too_large")); });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
// nginx sets X-Forwarded-For with $proxy_add_x_forwarded_for, which APPENDS the peer address,
// so the last entry is the one our own proxy added; earlier entries are client-supplied and spoofable.
function clientAddress(request) {
  return (request.headers["x-forwarded-for"]?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown").slice(0, 100);
}
// Two budgets per address: `sent` caps delivered mail (the expensive action), `seen` caps raw
// requests. Rejected submissions only spend `seen`, so correcting a form never locks the sender out.
function quotaFor(request) {
  const address = clientAddress(request);
  const now = Date.now(); const previous = attempts.get(address);
  if (previous && now - previous.startedAt <= config.rateWindow) return previous;
  const fresh = { startedAt: now, seen: 0, sent: 0 };
  attempts.set(address, fresh);
  return fresh;
}
setInterval(() => { const oldest = Date.now() - config.rateWindow; for (const [ip, item] of attempts) if (item.startedAt < oldest) attempts.delete(ip); }, config.rateWindow).unref();

async function contact(request, response, origin) {
  if (!config.origins.has(origin)) return json(response, 403, { error: "Forbidden origin." }, origin);
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") return json(response, 415, { error: "Unsupported content type." }, origin);
  const quota = quotaFor(request);
  if (quota.sent >= config.rateMax || quota.seen >= config.rateBurst) return json(response, 429, { error: "Too many requests. Please try again later." }, origin);
  quota.seen += 1;
  let payload;
  try { payload = JSON.parse(await readBody(request)); } catch (error) { return json(response, error.message === "too_large" ? 413 : 400, { error: "Invalid request." }, origin); }
  if (clean(payload.website, 200)) return json(response, 200, { ok: true }, origin);

  const name = clean(payload.name, 100), organisation = clean(payload.organisation, 120), email = clean(payload.email, 254).toLowerCase();
  const phone = clean(payload.phone, 32), type = clean(payload.type, 80), message = clean(payload.message, 3000);
  const phoneDigits = phone.replace(/\D/g, "");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneValid = /^[0-9+() -]+$/.test(phone) && phoneDigits.length >= 7 && phoneDigits.length <= 15;
  // Letters in any script plus the separators real names carry (S. K. Das, D'Souza, Anne-Marie);
  // digits and symbols are refused. U+2019 is allowed because phones autocorrect ' into it.
  const nameValid = /^[\p{L}\p{M}][\p{L}\p{M} '’\-.]{1,99}$/u.test(name);
  if (!nameValid || organisation.length < 2 || !emailValid || !phoneValid || !enquiryTypes.has(type) || message.length < 3 || payload.consent !== true) return json(response, 400, { error: "Please check the form and try again." }, origin);

  const safe = { name: escapeHtml(name), organisation: escapeHtml(organisation || "Not provided"), email: escapeHtml(email), phone: escapeHtml(phone || "Not provided"), type: escapeHtml(type), message: escapeHtml(message).replace(/\n/g, "<br />") };
  try {
    await Promise.all([
      transporter.sendMail({ from: `"ESKAY Website" <${process.env.SMTP_USER}>`, to: process.env.ADMIN_EMAIL, replyTo: email, subject: `[ESKAY Website] ${type} — ${name.replace(/[\r\n]/g, " ")}`, text: `New ESKAY website enquiry\n\nName: ${name}\nOrganisation: ${organisation || "Not provided"}\nEmail: ${email}\nPhone: ${phone || "Not provided"}\nEnquiry type: ${type}\n\nMessage:\n${message}`, html: emailShell(`<h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:28px">New website enquiry</h1><p style="margin:0 0 24px;color:#6a635c;font-size:14px">A new message was submitted through the ESKAY contact form.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6"><tr><td style="padding:8px 0;color:#7b736b;width:135px">Name</td><td style="padding:8px 0;font-weight:700">${safe.name}</td></tr><tr><td style="padding:8px 0;color:#7b736b">Organisation</td><td style="padding:8px 0">${safe.organisation}</td></tr><tr><td style="padding:8px 0;color:#7b736b">Email</td><td style="padding:8px 0"><a href="mailto:${safe.email}" style="color:#b51119">${safe.email}</a></td></tr><tr><td style="padding:8px 0;color:#7b736b">Phone</td><td style="padding:8px 0">${safe.phone}</td></tr><tr><td style="padding:8px 0;color:#7b736b">Enquiry type</td><td style="padding:8px 0">${safe.type}</td></tr></table><div style="margin-top:22px;padding:18px;border-left:3px solid #d6a63b;background:#faf7f1;font-size:14px;line-height:1.7">${safe.message}</div>`) }),
      transporter.sendMail({ from: `"ESKAY" <${process.env.SMTP_USER}>`, to: email, replyTo: process.env.ADMIN_EMAIL, subject: "We received your enquiry | ESKAY", text: `Dear ${name},\n\nThank you for contacting ESKAY. We have received your ${type.toLowerCase()} and it has been directed to the appropriate team.\n\nWe will respond using the contact details you provided.\n\nRegards,\nESKAY`, html: emailShell(`<p style="margin:0 0 8px;color:#b51119;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Enquiry received</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px">Thank you, ${safe.name}.</h1><p style="margin:0 0 14px;color:#5f5852;font-size:15px;line-height:1.7">We have received your <strong>${safe.type.toLowerCase()}</strong> and directed it to the appropriate ESKAY team.</p><p style="margin:0;color:#5f5852;font-size:15px;line-height:1.7">We will respond using the contact details you provided.</p>`) }),
    ]);
    quota.sent += 1;
    return json(response, 200, { ok: true }, origin);
  } catch (error) {
    console.error("SMTP delivery failed", { code: error?.code, command: error?.command, responseCode: error?.responseCode });
    return json(response, 502, { error: "We could not send your enquiry. Please try again shortly." }, origin);
  }
}

createServer(async (request, response) => {
  const origin = request.headers.origin ?? ""; const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true }, origin);
  if (request.method === "OPTIONS" && url.pathname === "/v1/contact") { if (!config.origins.has(origin)) return json(response, 403, { error: "Forbidden origin." }, origin); setCors(response, origin); response.writeHead(204); return response.end(); }
  if (request.method === "POST" && url.pathname === "/v1/contact") return contact(request, response, origin);
  return json(response, 404, { error: "Not found." }, origin);
}).listen(config.port, config.host, () => console.log(`ESKAY contact API listening on ${config.host}:${config.port}; allowed origins: ${[...config.origins].join(", ")}`));
