// Notification emails, in the same branded shell as the contact form's mail.

const escape = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);

const ROLE = { admin: "administrator", distributor: "distributor", dealer: "dealer", sales: "area sales manager" };

function shell(content) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f6f1e8;font-family:Arial,sans-serif;color:#211d19"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1e8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;overflow:hidden;background:#fff;border:1px solid #e5ddd1;border-radius:8px"><tr><td style="height:5px;background:linear-gradient(90deg,#ef1e2b,#d6a63b)"></td></tr><tr><td style="padding:28px 32px 10px"><div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#171513">ESKAY</div><div style="margin-top:5px;font-size:12px;color:#b51119">Partner portal</div></td></tr><tr><td style="padding:18px 32px 34px">${content}</td></tr><tr><td style="padding:18px 32px;background:#171513;color:#aaa39b;font-size:11px;line-height:1.6">This is an automated message from the ESKAY partner portal. Please do not reply to it.</td></tr></table></td></tr></table></body></html>`;
}
const heading = (text) => `<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:26px;line-height:1.25">${text}</h1>`;
const para = (text) => `<p style="margin:0 0 14px;color:#4f4943;font-size:15px;line-height:1.65">${text}</p>`;
const button = (href, label) => `<p style="margin:22px 0 6px"><a href="${escape(href)}" style="display:inline-block;padding:12px 22px;color:#fff;background:#dc111d;border-radius:6px;font-weight:700;font-size:14px;text-decoration:none">${escape(label)}</a></p>`;
const panel = (rows) => `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:6px 0 10px;border:1px solid #eadfc6;border-radius:6px;background:#fbf7ef">${rows.map(([k, v]) => `<tr><td style="padding:10px 14px;color:#7b736b;font-size:13px;width:150px">${escape(k)}</td><td style="padding:10px 14px;font-size:14px;font-weight:700">${v}</td></tr>`).join("")}</table>`;

export function accountCreated({ name, email, role, password, portalUrl }) {
  const signIn = `${portalUrl}/login`;
  return {
    to: email,
    subject: "Your ESKAY partner portal account",
    text: `Dear ${name},\n\nAn ESKAY partner portal account has been created for you as a ${ROLE[role]}.\n\nSign in: ${signIn}\nEmail: ${email}\nTemporary password: ${password}\n\nYou will be asked to choose your own password when you first sign in.\n\nRegards,\nESKAY`,
    html: shell(`${heading(`Welcome, ${escape(name)}.`)}${para(`An ESKAY partner portal account has been created for you as a <strong>${ROLE[role]}</strong>.`)}${panel([["Email", escape(email)], ["Temporary password", `<code style="font-size:15px;letter-spacing:.05em">${escape(password)}</code>`]])}${para("You will be asked to choose your own password when you first sign in.")}${button(signIn, "Sign in to the portal")}`),
  };
}

export function passwordReset({ name, email, password, portalUrl }) {
  const signIn = `${portalUrl}/login`;
  return {
    to: email,
    subject: "Your ESKAY portal password has been reset",
    text: `Dear ${name},\n\nYour ESKAY partner portal password has been reset by an administrator.\n\nSign in: ${signIn}\nTemporary password: ${password}\n\nYou will be asked to choose a new password when you sign in. If you did not expect this, please contact ESKAY.\n\nRegards,\nESKAY`,
    html: shell(`${heading("Your password has been reset")}${para(`Dear ${escape(name)}, an administrator has reset your ESKAY partner portal password.`)}${panel([["Temporary password", `<code style="font-size:15px;letter-spacing:.05em">${escape(password)}</code>`]])}${para("You will be asked to choose a new password when you sign in. If you did not expect this, please contact ESKAY.")}${button(signIn, "Sign in to the portal")}`),
  };
}

export function dealerAssignedToDistributor({ distributor, dealer, portalUrl }) {
  return {
    to: distributor.email,
    subject: `New dealer assigned: ${dealer.name}`,
    text: `Dear ${distributor.name},\n\n${dealer.name} has been assigned to you as a dealer.\n\n${dealer.organisation ? `Organisation: ${dealer.organisation}\n` : ""}Email: ${dealer.email}\n${dealer.phone ? `Phone: ${dealer.phone}\n` : ""}\nSee all your dealers: ${portalUrl}/portal/dealers\n\nRegards,\nESKAY`,
    html: shell(`${heading("A new dealer has been assigned to you")}${para(`Dear ${escape(distributor.name)}, the following dealer is now part of your network.`)}${panel([["Dealer", escape(dealer.name)], ...(dealer.organisation ? [["Organisation", escape(dealer.organisation)]] : []), ["Email", escape(dealer.email)], ...(dealer.phone ? [["Phone", escape(dealer.phone)]] : [])])}${button(`${portalUrl}/portal/dealers`, "View my dealers")}`),
  };
}

export function distributorAssignedToDealer({ dealer, distributor, portalUrl }) {
  return {
    to: dealer.email,
    subject: `Your ESKAY distributor: ${distributor.name}`,
    text: `Dear ${dealer.name},\n\n${distributor.name} is now your ESKAY distributor.\n\nEmail: ${distributor.email}\n${distributor.phone ? `Phone: ${distributor.phone}\n` : ""}\nRegards,\nESKAY`,
    html: shell(`${heading("Your distributor")}${para(`Dear ${escape(dealer.name)}, <strong>${escape(distributor.name)}</strong> is now your ESKAY distributor.`)}${panel([["Email", escape(distributor.email)], ...(distributor.phone ? [["Phone", escape(distributor.phone)]] : [])])}${button(`${portalUrl}/portal`, "Open the portal")}`),
  };
}

export function materialShared({ name, email, title, description, portalUrl }) {
  return {
    to: email,
    subject: `New download on the ESKAY portal: ${title}`,
    text: `Dear ${name},\n\nA new document has been shared with you on the ESKAY partner portal: ${title}.${description ? `\n\n${description}` : ""}\n\nDownload it here: ${portalUrl}/portal/materials\n\nRegards,\nESKAY`,
    html: shell(`${heading("A new document is ready for you")}${para(`Dear ${escape(name)}, ESKAY has shared <strong>${escape(title)}</strong> with you.`)}${description ? para(escape(description)) : ""}${button(`${portalUrl}/portal/materials`, "Open downloads")}`),
  };
}

export function schemePublished({ name, email, title, description, period, portalUrl }) {
  return {
    to: email,
    subject: `New scheme: ${title}`,
    text: `Dear ${name},\n\nA new scheme is available to you on the ESKAY partner portal: ${title} (${period}).${description ? `\n\n${description}` : ""}\n\nSee the details: ${portalUrl}/portal/schemes\n\nRegards,\nESKAY`,
    html: shell(`${heading(escape(title))}${para(`Dear ${escape(name)}, a new scheme is available to you.`)}${panel([["Period", escape(period)]])}${description ? para(escape(description)) : ""}${button(`${portalUrl}/portal/schemes`, "View schemes")}`),
  };
}
