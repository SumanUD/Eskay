import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DUMMY_HASH, hashPassword, hashToken, newToken, passwordProblem, temporaryPassword, verifyPassword } from "./auth.mjs";
import { transaction } from "./db.mjs";
import * as emails from "./emails.mjs";

export const PREFIX = "/v1/portal";

const ROLES = ["admin", "distributor", "dealer", "sales"];
const PARTNER_ROLES = ["distributor", "dealer"];
const AUDIENCES = ["all", "distributor", "dealer"];
const PRICE_LABEL = { distributor: "Distributor price", dealer: "Dealer price" };
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_JSON = 64 * 1024;
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_AVATAR = 5 * 1024 * 1024;
const MAX_PRICE_PAISE = 100_000_000;
const MAX_PRODUCT_IMAGES = 8;
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
// Scheme dates are Indian calendar days, so "today" is evaluated in IST rather than UTC.
const TODAY_IST = "date('now', '+330 minutes')";

// The MIME type served back is decided here from the extension, never taken from the upload,
// and the first bytes must match it, so a renamed HTML or script file cannot be stored.
const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b;
const IMAGE_TYPES = {
  png: { mime: "image/png", check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: "image/webp", check: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};
const UPLOAD_TYPES = {
  ...IMAGE_TYPES,
  pdf: { mime: "application/pdf", check: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", check: isZip },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", check: isZip },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", check: isZip },
  zip: { mime: "application/zip", check: isZip },
  csv: { mime: "text/csv", check: (b) => !b.subarray(0, 1024).includes(0) },
};

// While a temporary password is in force, only these requests are allowed through.
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(["GET /me", "POST /me/password", "POST /auth/logout"]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

// ---------- Input validation ----------

function text(value, field, min, max) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") fail(400, `${field} must be text.`);
  const cleaned = value.trim();
  if (min > 0 && !cleaned) fail(400, `${field} is required.`);
  if (cleaned.length < min) fail(400, `${field} must be at least ${min} characters.`);
  if (cleaned.length > max) fail(400, `${field} must be ${max} characters or fewer.`);
  return cleaned;
}
function email(value) {
  const cleaned = text(value, "Email", 1, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) fail(400, "Enter a valid email address.");
  return cleaned;
}
function phone(value) {
  const cleaned = text(value, "Phone", 0, 20);
  if (!/^[0-9+() -]*$/.test(cleaned)) fail(400, "Phone numbers can contain digits, spaces, +, ( ) and - only.");
  return cleaned;
}
function paise(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PRICE_PAISE) fail(400, `${field} must be between ₹0 and ₹${(MAX_PRICE_PAISE / 100).toLocaleString("en-IN")}.`);
  return value;
}
const optionalPaise = (value, field) => (value === null || value === undefined || value === "" ? null : paise(value, field));
function flag(value, field) {
  if (typeof value !== "boolean") fail(400, `${field} must be true or false.`);
  return value ? 1 : 0;
}
function optionalId(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isSafeInteger(value) || value < 1) fail(400, `${field} is not valid.`);
  return value;
}
function idList(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(400, `${field} must be a list.`);
  const ids = value.map((item) => optionalId(item, field));
  if (ids.includes(null)) fail(400, `${field} is not valid.`);
  return [...new Set(ids)];
}
function day(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) fail(400, `${field} must be a date.`);
  return value;
}
const oneOf = (value, allowed, message) => (allowed.includes(value) ? value : fail(400, message));
const placeholders = (list) => list.map(() => "?").join(", ");

const isUniqueViolation = (error) => /UNIQUE constraint failed/.test(error?.message ?? "");
const isForeignKeyViolation = (error) => /FOREIGN KEY constraint failed/.test(error?.message ?? "");

// ---------- HTTP plumbing ----------

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function readRaw(request, limit) {
  if (Number(request.headers["content-length"] ?? 0) > limit) fail(413, `Files must be ${Math.round(limit / 1024 / 1024)} MB or smaller.`);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail(413, `Files must be ${Math.round(limit / 1024 / 1024)} MB or smaller.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") fail(415, "Requests must be sent as JSON.");
  let body;
  try {
    body = JSON.parse((await readRaw(request, MAX_JSON)).toString("utf8") || "{}");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, "The request could not be read.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "The request could not be read.");
  return body;
}

// nginx appends the connecting address to X-Forwarded-For, so the last entry is the one our own
// proxy added; anything before it was supplied by the client and cannot be trusted.
function clientAddress(request) {
  return (request.headers["x-forwarded-for"]?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown").slice(0, 100);
}

const silentMailer = { enabled: false, async send() {} };

export function createPortal({ db, filesDir, origins, mailer = silentMailer, portalUrl = "https://eskaylife.com", now = () => Date.now() }) {
  const routes = [];
  const route = (method, pattern, roles, handler) => {
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, "(?<$1>\\d+)")}$`);
    routes.push({ key: `${method} ${pattern}`, method, regex, roles, handler });
  };

  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const count = (sql, ...params) => one(sql, ...params).n;

  // Column names always come from this file, never from the request, so building the SET clause
  // from object keys is safe.
  function update(table, id, fields, { touch = false } = {}) {
    const keys = Object.keys(fields);
    const sets = keys.map((key) => `${key} = ?`);
    if (touch) sets.push(`updated_at = ${NOW_SQL}`);
    if (!sets.length) return;
    run(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, ...keys.map((key) => fields[key]), id);
  }
  function insert(table, fields) {
    const keys = Object.keys(fields);
    return Number(run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders(keys)})`, ...keys.map((key) => fields[key])).lastInsertRowid);
  }

  // ---------- Notifications ----------

  // Mail is sent after the request has answered and never holds it up; a delivery failure is
  // logged rather than surfaced, because the change it describes has already been saved.
  const pendingMail = new Set();
  function notify(message) {
    if (!message?.to) return;
    const delivery = Promise.resolve()
      .then(() => mailer.send(message))
      .catch((error) => console.error("Notification email failed", { subject: message.subject, message: error?.message }))
      .finally(() => pendingMail.delete(delivery));
    pendingMail.add(delivery);
  }
  const flushMail = () => Promise.allSettled([...pendingMail]);

  // ---------- Sign-in rate limiting ----------

  const failures = new Map();
  const hits = (key) => {
    const entry = failures.get(key);
    return entry && now() - entry.startedAt <= LOGIN_WINDOW_MS ? entry.count : 0;
  };
  const loginKeys = (ip, address) => [`ip:${ip}`, `pair:${ip}:${address}`, `email:${address}`];
  const loginLimited = (ip, address) => hits(`ip:${ip}`) >= 50 || hits(`pair:${ip}:${address}`) >= 10 || hits(`email:${address}`) >= 30;
  function recordLoginFailure(ip, address) {
    for (const key of loginKeys(ip, address)) {
      const entry = failures.get(key);
      if (!entry || now() - entry.startedAt > LOGIN_WINDOW_MS) failures.set(key, { count: 1, startedAt: now() });
      else entry.count += 1;
    }
  }
  const sweepFailures = () => {
    for (const [key, entry] of failures) if (now() - entry.startedAt > LOGIN_WINDOW_MS) failures.delete(key);
  };

  // ---------- Sessions ----------

  function authenticate(request) {
    const match = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(request.headers.authorization ?? "");
    if (!match) return null;
    const tokenHash = hashToken(match[1]);
    const user = one("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1", tokenHash, now());
    return user ? { user, session: { token_hash: tokenHash } } : null;
  }

  // ---------- Shaping ----------

  const USER_SELECT = `
    SELECT u.id, u.role, u.email, u.name, u.organisation, u.phone, u.address,
           u.state_id, s.name AS state, u.distributor_id, d.name AS distributor,
           u.sales_manager_id, m.name AS sales_manager, u.active, u.must_change_password,
           u.avatar_file_id IS NOT NULL AS has_avatar, u.created_at, u.last_login_at,
           (SELECT COUNT(*) FROM users x WHERE x.distributor_id = u.id AND x.role = 'dealer' AND x.active = 1) AS dealer_count
    FROM users u
    LEFT JOIN states s ON s.id = u.state_id
    LEFT JOIN users d ON d.id = u.distributor_id
    LEFT JOIN users m ON m.id = u.sales_manager_id`;
  const shapeUser = (row) => row && { ...row, active: Boolean(row.active), must_change_password: Boolean(row.must_change_password), has_avatar: Boolean(row.has_avatar) };
  const getUser = (id) => shapeUser(one(`${USER_SELECT} WHERE u.id = ?`, id));
  // The fields one partner may see about another: contact details only, no account internals.
  const contact = (row) => ({ id: row.id, name: row.name, organisation: row.organisation, email: row.email, phone: row.phone, address: row.address, state: row.state, has_avatar: Boolean(row.has_avatar) });

  // ---------- Product visibility ----------

  const regionFilterOn = () => one("SELECT value FROM settings WHERE key = 'region_filter'")?.value === "on";

  // The single definition of which products a signed-in user may see. Admins see everything;
  // distributors and dealers see active products, and, once the region filter is switched on,
  // only those flagged for their own state.
  function productScope(user) {
    if (user.role === "admin") return { where: "1 = 1", params: [] };
    const clauses = ["p.active = 1"];
    const params = [];
    if (regionFilterOn()) {
      clauses.push("EXISTS (SELECT 1 FROM product_states ps WHERE ps.product_id = p.id AND ps.state_id = ?)");
      params.push(user.state_id ?? -1);
    }
    return { where: clauses.join(" AND "), params };
  }
  function visibleProducts(user, extra = "", extraParams = []) {
    const scope = productScope(user);
    return all(`SELECT p.* FROM products p WHERE ${scope.where} ${extra} ORDER BY p.brand COLLATE NOCASE, p.name COLLATE NOCASE`, ...scope.params, ...extraParams);
  }
  const visibleProduct = (user, id) => visibleProducts(user, "AND p.id = ?", [id])[0];

  function groupBy(rows, key) {
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row[key])) map.set(row[key], []);
      map.get(row[key]).push(row);
    }
    return map;
  }
  function productExtras(productIds) {
    if (!productIds.length) return { states: new Map(), images: new Map() };
    const ids = placeholders(productIds);
    return {
      states: groupBy(all(`SELECT ps.product_id, s.id, s.name FROM product_states ps JOIN states s ON s.id = ps.state_id WHERE ps.product_id IN (${ids}) ORDER BY s.name COLLATE NOCASE`, ...productIds), "product_id"),
      images: groupBy(all(`SELECT id, product_id, file_id FROM product_images WHERE product_id IN (${ids}) ORDER BY position, id`, ...productIds), "product_id"),
    };
  }

  // Each role receives only its own price. The other price is not hidden in the payload, it is
  // never added to it, so it cannot be read from the network tab. MRP and the retail counter
  // price are the same for everyone.
  function shapeProduct(row, user, extras) {
    const images = extras.images.get(row.id) ?? [];
    const base = {
      id: row.id, name: row.name, code: row.code, brand: row.brand, category: row.category, description: row.description,
      pack_size: row.pack_size, mrp: row.mrp, retail_price: row.retail_price,
      images: images.map((image) => image.id), has_image: images.length > 0,
      states: (extras.states.get(row.id) ?? []).map(({ id, name }) => ({ id, name })), updated_at: row.updated_at,
    };
    if (user.role === "admin") {
      return { ...base, image_file_ids: images.map((image) => image.file_id), distributor_price: row.distributor_price, dealer_price: row.dealer_price, active: Boolean(row.active) };
    }
    return { ...base, price: row[`${user.role}_price`], price_label: PRICE_LABEL[user.role] };
  }
  function shapeProducts(rows, user) {
    const extras = productExtras(rows.map((row) => row.id));
    return rows.map((row) => shapeProduct(row, user, extras));
  }

  function stateList(value) {
    if (!Array.isArray(value) || !value.length) fail(400, "Choose at least one state for this product.");
    const ids = idList(value, "State");
    if (!ids.length) fail(400, "Choose at least one state for this product.");
    if (count(`SELECT COUNT(*) AS n FROM states WHERE id IN (${placeholders(ids)})`, ...ids) !== ids.length) fail(400, "One of the selected states no longer exists.");
    return ids;
  }
  function setProductStates(productId, stateIds) {
    run("DELETE FROM product_states WHERE product_id = ?", productId);
    for (const stateId of stateIds) run("INSERT INTO product_states (product_id, state_id) VALUES (?, ?)", productId, stateId);
  }

  // ---------- Files ----------

  function imageFiles(value) {
    const ids = idList(value, "Image");
    if (ids.length > MAX_PRODUCT_IMAGES) fail(400, `A product can have up to ${MAX_PRODUCT_IMAGES} images.`);
    for (const fileId of ids) {
      const file = one("SELECT mime FROM files WHERE id = ?", fileId);
      if (!file) fail(400, "One of the uploaded images could not be found.");
      if (!file.mime.startsWith("image/")) fail(400, "Product images must be PNG, JPEG or WebP.");
    }
    return ids;
  }
  async function removeFileIfUnused(fileId) {
    if (!fileId) return;
    const used = count(`SELECT (SELECT COUNT(*) FROM product_images WHERE file_id = ?) + (SELECT COUNT(*) FROM materials WHERE file_id = ?)
      + (SELECT COUNT(*) FROM users WHERE avatar_file_id = ?) AS n`, fileId, fileId, fileId);
    if (used) return;
    const file = one("SELECT stored_name FROM files WHERE id = ?", fileId);
    if (!file) return;
    run("DELETE FROM files WHERE id = ?", fileId);
    await rm(join(filesDir, file.stored_name), { force: true });
  }
  async function storeFile(name, data, types) {
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const type = Object.hasOwn(types, extension) ? types[extension] : null;
    if (!type) return null;
    if (!data.length) fail(400, "The file is empty.");
    if (!type.check(data)) fail(415, `This file does not look like a real .${extension} file.`);
    const storedName = `${randomBytes(16).toString("hex")}.${extension}`;
    await writeFile(join(filesDir, storedName), data, { flag: "wx" });
    const id = insert("files", { stored_name: storedName, original_name: name, mime: type.mime, size: data.length });
    return { id, original_name: name, mime: type.mime, size: data.length };
  }
  function uploadName(request, fallback) {
    let name;
    try {
      name = decodeURIComponent(String(request.headers["x-file-name"] ?? fallback));
    } catch {
      fail(400, "The file name could not be read.");
    }
    name = name.replace(/[\\/\r\n\0]/g, "_").trim().slice(-150);
    if (!name) fail(400, "A file name is required.");
    return name;
  }
  function sendFile(response, file, { download }) {
    response.writeHead(200, {
      "Content-Type": file.mime,
      "Content-Length": file.size,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Even if a file were opened directly, it runs with no script and no same-origin access.
      "Content-Security-Policy": "sandbox",
    });
    // Headers are already sent, so a read failure can only abort the response; without this
    // handler an unreadable file would raise an uncaught error and take the whole service down.
    createReadStream(join(filesDir, file.stored_name))
      .on("error", (error) => {
        console.error("Stored file could not be read", { id: file.id, message: error.message });
        response.destroy();
      })
      .pipe(response);
  }

  // Uploads are a separate step from the record that uses them, so a file can be orphaned if an
  // admin abandons a form. Anything unreferenced for a day is removed.
  async function sweepOrphanFiles() {
    const orphans = all(`SELECT id FROM files WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')
      AND id NOT IN (SELECT file_id FROM product_images) AND id NOT IN (SELECT file_id FROM materials)
      AND id NOT IN (SELECT avatar_file_id FROM users WHERE avatar_file_id IS NOT NULL)`);
    for (const { id } of orphans) await removeFileIfUnused(id);
    return orphans.length;
  }

  // ---------- Authentication ----------

  route("GET", "/health", null, () => [200, { ok: true }]);

  route("POST", "/auth/login", null, async ({ request }) => {
    const body = await readJson(request);
    const address = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const ip = clientAddress(request);
    if (loginLimited(ip, address)) fail(429, "Too many sign-in attempts. Please wait 15 minutes and try again.");
    const account = address ? one("SELECT id, password_hash, active FROM users WHERE email = ?", address) : undefined;
    const valid = await verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
    if (!account || !valid) {
      recordLoginFailure(ip, address);
      fail(401, "Incorrect email or password.");
    }
    if (!account.active) fail(403, "This account has been deactivated. Please contact ESKAY.");
    failures.delete(`pair:${ip}:${address}`);
    const token = newToken();
    run("DELETE FROM sessions WHERE expires_at <= ?", now());
    run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", hashToken(token), account.id, now() + SESSION_MS);
    run(`UPDATE users SET last_login_at = ${NOW_SQL} WHERE id = ?`, account.id);
    return [200, { token, expires_at: new Date(now() + SESSION_MS).toISOString(), user: getUser(account.id) }];
  });

  route("POST", "/auth/logout", "*", ({ session }) => {
    run("DELETE FROM sessions WHERE token_hash = ?", session.token_hash);
    return [200, { ok: true }];
  });

  // ---------- Own profile ----------

  route("GET", "/me", "*", ({ user }) => [200, { user: getUser(user.id) }]);

  // Partners' details, email and region are managed by ESKAY; a partner's own profile only lets
  // them change their password and picture. Admins keep their details editable here.
  route("PATCH", "/me", ["admin"], async ({ request, user }) => {
    const body = await readJson(request);
    const fields = {};
    if ("name" in body) fields.name = text(body.name, "Name", 2, 100);
    if ("organisation" in body) fields.organisation = text(body.organisation, "Organisation", 0, 120);
    if ("phone" in body) fields.phone = phone(body.phone);
    if ("address" in body) fields.address = text(body.address, "Address", 0, 300);
    if ("email" in body) fields.email = email(body.email);
    try {
      update("users", user.id, fields);
    } catch (error) {
      return userConflict(error);
    }
    return [200, { user: getUser(user.id) }];
  });

  route("POST", "/me/password", "*", async ({ request, user, session }) => {
    const body = await readJson(request);
    const current = typeof body.current_password === "string" ? body.current_password : "";
    if (!(await verifyPassword(current, user.password_hash))) fail(400, "Your current password is incorrect.");
    const problem = passwordProblem(body.new_password);
    if (problem) fail(400, problem);
    if (body.new_password === current) fail(400, "Choose a password different from your current one.");
    run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", await hashPassword(body.new_password), user.id);
    // Any other device signed in with the old password is signed out.
    run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", user.id, session.token_hash);
    return [200, { user: getUser(user.id) }];
  });

  route("POST", "/me/avatar", "*", async ({ request, user }) => {
    const name = uploadName(request, "avatar.png");
    const stored = await storeFile(name, await readRaw(request, MAX_AVATAR), IMAGE_TYPES);
    if (!stored) fail(415, "Profile pictures must be PNG, JPEG or WebP.");
    run("UPDATE users SET avatar_file_id = ? WHERE id = ?", stored.id, user.id);
    await removeFileIfUnused(user.avatar_file_id);
    return [200, { user: getUser(user.id) }];
  });

  route("DELETE", "/me/avatar", "*", async ({ user }) => {
    run("UPDATE users SET avatar_file_id = NULL WHERE id = ?", user.id);
    await removeFileIfUnused(user.avatar_file_id);
    return [200, { user: getUser(user.id) }];
  });

  const serveAvatar = (response, userId) => {
    const file = one("SELECT f.* FROM users u JOIN files f ON f.id = u.avatar_file_id WHERE u.id = ?", userId);
    if (!file) fail(404, "No profile picture.");
    sendFile(response, file, { download: false });
  };
  route("GET", "/me/avatar", "*", ({ user, response }) => serveAvatar(response, user.id));
  route("GET", "/users/:id/avatar", ["admin"], ({ params, response }) => serveAvatar(response, params.id));

  // ---------- States ----------

  route("GET", "/states", "*", ({ user }) => {
    if (user.role !== "admin") return [200, { states: all("SELECT id, name, code FROM states WHERE active = 1 ORDER BY name COLLATE NOCASE") }];
    const rows = all(`SELECT s.id, s.name, s.code, s.active, s.created_at,
        (SELECT COUNT(*) FROM product_states ps WHERE ps.state_id = s.id) AS product_count,
        (SELECT COUNT(*) FROM users u WHERE u.state_id = s.id) AS user_count
      FROM states s ORDER BY s.name COLLATE NOCASE`);
    return [200, { states: rows.map((row) => ({ ...row, active: Boolean(row.active) })) }];
  });

  function stateFields(body, partial) {
    const fields = {};
    if (!partial || "name" in body) fields.name = text(body.name, "State name", 2, 60);
    if ("code" in body) fields.code = text(body.code, "State code", 0, 10).toUpperCase() || null;
    if ("active" in body) fields.active = flag(body.active, "Active");
    return fields;
  }
  const stateConflict = (error) => (isUniqueViolation(error) ? fail(409, "A state with this name or code already exists.") : Promise.reject(error));

  route("POST", "/states", ["admin"], async ({ request }) => {
    const fields = stateFields(await readJson(request), false);
    try {
      return [201, { state: one("SELECT * FROM states WHERE id = ?", insert("states", fields)) }];
    } catch (error) {
      return stateConflict(error);
    }
  });

  route("PATCH", "/states/:id", ["admin"], async ({ request, params }) => {
    if (!one("SELECT id FROM states WHERE id = ?", params.id)) fail(404, "State not found.");
    const fields = stateFields(await readJson(request), true);
    try {
      update("states", params.id, fields);
    } catch (error) {
      return stateConflict(error);
    }
    return [200, { state: one("SELECT * FROM states WHERE id = ?", params.id) }];
  });

  route("DELETE", "/states/:id", ["admin"], ({ params }) => {
    if (!one("SELECT id FROM states WHERE id = ?", params.id)) fail(404, "State not found.");
    try {
      run("DELETE FROM states WHERE id = ?", params.id);
    } catch (error) {
      if (isForeignKeyViolation(error)) fail(409, "This state is still assigned to products or users. Deactivate it instead, or remove it from them first.");
      throw error;
    }
    return [200, { ok: true }];
  });

  // ---------- Products ----------

  const CATALOGUE_ROLES = ["admin", "distributor", "dealer"];

  route("GET", "/products", CATALOGUE_ROLES, ({ user }) => [200, { products: shapeProducts(visibleProducts(user), user) }]);

  route("GET", "/products/:id", CATALOGUE_ROLES, ({ user, params }) => {
    const row = visibleProduct(user, params.id);
    // A product outside the user's scope is reported as missing rather than forbidden, so its
    // existence is not disclosed.
    if (!row) fail(404, "Product not found.");
    const scope = materialScope(user);
    const materials = all(`${MATERIAL_SELECT} WHERE m.product_id = ? AND ${scope.where} ORDER BY m.title COLLATE NOCASE`, params.id, ...scope.params);
    return [200, { product: shapeProduct(row, user, productExtras([row.id])), materials }];
  });

  function sendProductImage(user, productId, imageId, response) {
    if (!visibleProduct(user, productId)) fail(404, "Image not found.");
    const file = imageId
      ? one("SELECT f.* FROM product_images i JOIN files f ON f.id = i.file_id WHERE i.id = ? AND i.product_id = ?", imageId, productId)
      : one("SELECT f.* FROM product_images i JOIN files f ON f.id = i.file_id WHERE i.product_id = ? ORDER BY i.position, i.id LIMIT 1", productId);
    if (!file) fail(404, "Image not found.");
    sendFile(response, file, { download: false });
  }
  route("GET", "/products/:id/image", CATALOGUE_ROLES, ({ user, params, response }) => sendProductImage(user, params.id, null, response));
  route("GET", "/products/:id/images/:image", CATALOGUE_ROLES, ({ user, params, response }) => sendProductImage(user, params.id, params.image, response));

  function productFields(body, partial) {
    const fields = {};
    const needs = (key) => !partial || key in body;
    if (needs("name")) fields.name = text(body.name, "Product name", 2, 120);
    if (needs("code")) fields.code = text(body.code, "Product code", 1, 40).toUpperCase();
    if ("brand" in body) fields.brand = text(body.brand, "Brand", 0, 80);
    if ("category" in body) fields.category = text(body.category, "Category", 0, 60);
    if ("description" in body) fields.description = text(body.description, "Description", 0, 5000);
    if ("pack_size" in body) fields.pack_size = text(body.pack_size, "Pack size", 0, 120);
    if (needs("distributor_price")) fields.distributor_price = paise(body.distributor_price, "Distributor price");
    if (needs("dealer_price")) fields.dealer_price = paise(body.dealer_price, "Dealer price");
    if ("mrp" in body) fields.mrp = optionalPaise(body.mrp, "MRP");
    if ("retail_price" in body) fields.retail_price = optionalPaise(body.retail_price, "Retail counter price");
    if ("active" in body) fields.active = flag(body.active, "Active");
    const stateIds = needs("state_ids") ? stateList(body.state_ids) : undefined;
    const imageIds = "image_file_ids" in body ? imageFiles(body.image_file_ids) : undefined;
    return { fields, stateIds, imageIds };
  }
  function setProductImages(productId, fileIds) {
    run("DELETE FROM product_images WHERE product_id = ?", productId);
    fileIds.forEach((fileId, position) => run("INSERT INTO product_images (product_id, file_id, position) VALUES (?, ?, ?)", productId, fileId, position));
  }
  const productConflict = (error) => (isUniqueViolation(error) ? fail(409, "A product with this code already exists.") : Promise.reject(error));
  const adminProduct = (id) => shapeProduct(one("SELECT * FROM products WHERE id = ?", id), { role: "admin" }, productExtras([id]));
  const productFileIds = (id) => all("SELECT file_id FROM product_images WHERE product_id = ?", id).map((row) => row.file_id);

  route("POST", "/products", ["admin"], async ({ request }) => {
    const { fields, stateIds, imageIds } = productFields(await readJson(request), false);
    try {
      const id = transaction(db, () => {
        const productId = insert("products", fields);
        setProductStates(productId, stateIds);
        if (imageIds) setProductImages(productId, imageIds);
        return productId;
      });
      return [201, { product: adminProduct(id) }];
    } catch (error) {
      return productConflict(error);
    }
  });

  route("PATCH", "/products/:id", ["admin"], async ({ request, params }) => {
    if (!one("SELECT id FROM products WHERE id = ?", params.id)) fail(404, "Product not found.");
    const { fields, stateIds, imageIds } = productFields(await readJson(request), true);
    const previousFiles = productFileIds(params.id);
    try {
      transaction(db, () => {
        update("products", params.id, fields, { touch: true });
        if (stateIds) setProductStates(params.id, stateIds);
        if (imageIds) setProductImages(params.id, imageIds);
      });
    } catch (error) {
      return productConflict(error);
    }
    if (imageIds) for (const fileId of previousFiles) if (!imageIds.includes(fileId)) await removeFileIfUnused(fileId);
    return [200, { product: adminProduct(params.id) }];
  });

  route("DELETE", "/products/:id", ["admin"], async ({ params }) => {
    if (!one("SELECT id FROM products WHERE id = ?", params.id)) fail(404, "Product not found.");
    const files = productFileIds(params.id);
    run("DELETE FROM products WHERE id = ?", params.id);
    for (const fileId of files) await removeFileIfUnused(fileId);
    return [200, { ok: true }];
  });

  // ---------- Uploads (admin) ----------

  route("POST", "/files", ["admin"], async ({ request }) => {
    const name = uploadName(request, "");
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    if (!Object.hasOwn(UPLOAD_TYPES, extension)) fail(415, "Upload a PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint, CSV or ZIP file.");
    const stored = await storeFile(name, await readRaw(request, MAX_UPLOAD), UPLOAD_TYPES);
    return [201, { file: stored }];
  });

  // ---------- Downloadable material ----------

  const MATERIAL_SELECT = `
    SELECT m.id, m.title, m.description, m.audience, m.product_id, lp.name AS product,
           f.original_name AS file_name, f.mime AS file_mime, f.size AS file_size, m.created_at,
           (SELECT COUNT(*) FROM material_recipients r WHERE r.material_id = m.id) AS recipient_count
    FROM materials m JOIN files f ON f.id = m.file_id LEFT JOIN products lp ON lp.id = m.product_id`;

  // Who may see a material: its audience (distributors, dealers or both); within that, only the
  // named accounts when the admin picked any; and, when it is linked to a product, only where
  // that product is visible, so the region flag governs both.
  function materialScope(user) {
    if (user.role === "admin") return { where: "1 = 1", params: [] };
    const products = productScope(user);
    return {
      where: `m.audience IN ('all', ?)
        AND (NOT EXISTS (SELECT 1 FROM material_recipients r WHERE r.material_id = m.id)
             OR EXISTS (SELECT 1 FROM material_recipients r WHERE r.material_id = m.id AND r.user_id = ?))
        AND (m.product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id = m.product_id AND ${products.where}))`,
      params: [user.role, user.id, ...products.params],
    };
  }
  const CONTENT_ROLES = ["admin", "distributor", "dealer"];

  function withRecipients(materials) {
    if (!materials.length) return materials;
    const rows = groupBy(all(`SELECT r.material_id, u.id, u.name, u.role FROM material_recipients r JOIN users u ON u.id = r.user_id
      WHERE r.material_id IN (${placeholders(materials)}) ORDER BY u.name COLLATE NOCASE`, ...materials.map((m) => m.id)), "material_id");
    return materials.map((m) => ({ ...m, recipients: (rows.get(m.id) ?? []).map(({ id, name, role }) => ({ id, name, role })) }));
  }

  route("GET", "/materials", CONTENT_ROLES, ({ user }) => {
    const scope = materialScope(user);
    const rows = all(`${MATERIAL_SELECT} WHERE ${scope.where} ORDER BY m.created_at DESC, m.id DESC`, ...scope.params);
    // Partners are not shown who else a material went to.
    return [200, { materials: user.role === "admin" ? withRecipients(rows) : rows.map(({ recipient_count: _, ...rest }) => rest) }];
  });

  route("GET", "/materials/:id/download", CONTENT_ROLES, ({ user, params, response }) => {
    const scope = materialScope(user);
    const file = one(`SELECT f.* FROM materials m JOIN files f ON f.id = m.file_id WHERE m.id = ? AND ${scope.where}`, params.id, ...scope.params);
    if (!file) fail(404, "File not found.");
    sendFile(response, file, { download: true });
  });

  function materialFields(body, partial, existing) {
    const fields = {};
    if (!partial || "title" in body) fields.title = text(body.title, "Title", 2, 120);
    if ("description" in body) fields.description = text(body.description, "Description", 0, 2000);
    if (!partial || "audience" in body) fields.audience = oneOf(body.audience, AUDIENCES, "Choose who can see this material.");
    if ("product_id" in body) {
      fields.product_id = optionalId(body.product_id, "Product");
      if (fields.product_id && !one("SELECT id FROM products WHERE id = ?", fields.product_id)) fail(400, "The linked product no longer exists.");
    }
    if (!partial || "file_id" in body) {
      fields.file_id = optionalId(body.file_id, "File");
      if (!fields.file_id || !one("SELECT id FROM files WHERE id = ?", fields.file_id)) fail(400, "Upload a file for this material.");
    }
    // Recipients narrow the audience to named accounts, so each must hold the audience's role.
    const audience = fields.audience ?? existing?.audience;
    let recipientIds;
    if ("recipient_ids" in body || (partial && "audience" in body)) {
      recipientIds = audience === "all" ? [] : idList(body.recipient_ids, "Recipient");
      if (recipientIds.length && count(`SELECT COUNT(*) AS n FROM users WHERE id IN (${placeholders(recipientIds)}) AND role = ?`, ...recipientIds, audience) !== recipientIds.length) {
        fail(400, `Every selected recipient must be a ${audience}.`);
      }
    }
    return { fields, recipientIds };
  }
  function setRecipients(materialId, userIds) {
    run("DELETE FROM material_recipients WHERE material_id = ?", materialId);
    for (const userId of userIds) run("INSERT INTO material_recipients (material_id, user_id) VALUES (?, ?)", materialId, userId);
  }
  const getMaterial = (id) => withRecipients([one(`${MATERIAL_SELECT} WHERE m.id = ?`, id)])[0];

  // Everyone who can now see a material, found with the same rule the listing uses.
  function materialAudience(materialId) {
    const candidates = all("SELECT * FROM users WHERE active = 1 AND role IN ('distributor', 'dealer')");
    return candidates.filter((candidate) => {
      const scope = materialScope(candidate);
      return one(`SELECT 1 AS ok FROM materials m WHERE m.id = ? AND ${scope.where}`, materialId, ...scope.params);
    });
  }

  route("POST", "/materials", ["admin"], async ({ request }) => {
    const { fields, recipientIds } = materialFields(await readJson(request), false);
    const id = transaction(db, () => {
      const materialId = insert("materials", fields);
      setRecipients(materialId, recipientIds ?? []);
      return materialId;
    });
    const material = getMaterial(id);
    for (const person of materialAudience(id)) notify(emails.materialShared({ name: person.name, email: person.email, title: material.title, description: material.description, portalUrl }));
    return [201, { material }];
  });

  route("PATCH", "/materials/:id", ["admin"], async ({ request, params }) => {
    const existing = one("SELECT * FROM materials WHERE id = ?", params.id);
    if (!existing) fail(404, "Material not found.");
    const before = new Set(materialAudience(params.id).map((person) => person.id));
    const { fields, recipientIds } = materialFields(await readJson(request), true, existing);
    transaction(db, () => {
      update("materials", params.id, fields);
      if (recipientIds) setRecipients(params.id, recipientIds);
    });
    if (fields.file_id && fields.file_id !== existing.file_id) await removeFileIfUnused(existing.file_id);
    const material = getMaterial(params.id);
    // Only people who could not see it before are told about it.
    for (const person of materialAudience(params.id)) {
      if (!before.has(person.id)) notify(emails.materialShared({ name: person.name, email: person.email, title: material.title, description: material.description, portalUrl }));
    }
    return [200, { material }];
  });

  route("DELETE", "/materials/:id", ["admin"], async ({ params }) => {
    const existing = one("SELECT file_id FROM materials WHERE id = ?", params.id);
    if (!existing) fail(404, "Material not found.");
    run("DELETE FROM materials WHERE id = ?", params.id);
    await removeFileIfUnused(existing.file_id);
    return [200, { ok: true }];
  });

  // ---------- Schemes ----------

  const SCHEME_SELECT = `
    SELECT sc.id, sc.title, sc.description, sc.audience, sc.starts_on, sc.ends_on, sc.active, sc.created_at,
      CASE WHEN sc.ends_on IS NOT NULL AND sc.ends_on < ${TODAY_IST} THEN 'expired'
           WHEN sc.starts_on IS NOT NULL AND sc.starts_on > ${TODAY_IST} THEN 'upcoming'
           ELSE 'current' END AS status
    FROM schemes sc`;
  function schemeScope(user) {
    if (user.role === "admin") return { where: "1 = 1", params: [] };
    return { where: `sc.active = 1 AND sc.audience IN ('all', ?) AND (sc.ends_on IS NULL OR sc.ends_on >= ${TODAY_IST})`, params: [user.role] };
  }
  const shapeScheme = (row) => row && { ...row, active: Boolean(row.active) };

  route("GET", "/schemes", CONTENT_ROLES, ({ user }) => {
    const scope = schemeScope(user);
    return [200, { schemes: all(`${SCHEME_SELECT} WHERE ${scope.where} ORDER BY COALESCE(sc.starts_on, sc.created_at) DESC, sc.id DESC`, ...scope.params).map(shapeScheme) }];
  });

  function schemeFields(body, partial, existing) {
    const fields = {};
    if (!partial || "title" in body) fields.title = text(body.title, "Title", 2, 120);
    if ("description" in body) fields.description = text(body.description, "Description", 0, 5000);
    if (!partial || "audience" in body) fields.audience = oneOf(body.audience, AUDIENCES, "Choose who this scheme is for.");
    if ("starts_on" in body) fields.starts_on = day(body.starts_on, "Start date");
    if ("ends_on" in body) fields.ends_on = day(body.ends_on, "End date");
    if ("active" in body) fields.active = flag(body.active, "Active");
    const starts = "starts_on" in fields ? fields.starts_on : existing?.starts_on;
    const ends = "ends_on" in fields ? fields.ends_on : existing?.ends_on;
    if (starts && ends && ends < starts) fail(400, "The end date must be on or after the start date.");
    return fields;
  }
  const getScheme = (id) => shapeScheme(one(`${SCHEME_SELECT} WHERE sc.id = ?`, id));
  const period = ({ starts_on: starts, ends_on: ends }) => (starts && ends ? `${starts} to ${ends}` : starts ? `From ${starts}` : ends ? `Until ${ends}` : "Ongoing");

  route("POST", "/schemes", ["admin"], async ({ request }) => {
    const scheme = getScheme(insert("schemes", schemeFields(await readJson(request), false)));
    if (scheme.active && scheme.status !== "expired") {
      const roles = scheme.audience === "all" ? PARTNER_ROLES : [scheme.audience];
      for (const person of all(`SELECT name, email FROM users WHERE active = 1 AND role IN (${placeholders(roles)})`, ...roles)) {
        notify(emails.schemePublished({ name: person.name, email: person.email, title: scheme.title, description: scheme.description, period: period(scheme), portalUrl }));
      }
    }
    return [201, { scheme }];
  });

  route("PATCH", "/schemes/:id", ["admin"], async ({ request, params }) => {
    const existing = one("SELECT * FROM schemes WHERE id = ?", params.id);
    if (!existing) fail(404, "Scheme not found.");
    update("schemes", params.id, schemeFields(await readJson(request), true, existing));
    return [200, { scheme: getScheme(params.id) }];
  });

  route("DELETE", "/schemes/:id", ["admin"], ({ params }) => {
    if (!run("DELETE FROM schemes WHERE id = ?", params.id).changes) fail(404, "Scheme not found.");
    return [200, { ok: true }];
  });

  // ---------- Own network ----------

  route("GET", "/my/dealers", ["distributor"], ({ user }) => [200, {
    dealers: all(`${USER_SELECT} WHERE u.role = 'dealer' AND u.active = 1 AND u.distributor_id = ? ORDER BY u.name COLLATE NOCASE`, user.id).map(contact),
  }]);

  route("GET", "/my/distributors", ["sales"], ({ user }) => [200, {
    distributors: all(`${USER_SELECT} WHERE u.role = 'distributor' AND u.active = 1 AND u.sales_manager_id = ? ORDER BY u.name COLLATE NOCASE`, user.id)
      .map((row) => ({ ...contact(row), dealer_count: row.dealer_count })),
  }]);

  // A partner's picture is visible to the partners linked to them, and to admins.
  route("GET", "/contacts/:id/avatar", ["distributor", "dealer", "sales"], ({ user, params, response }) => {
    const linked = one(`SELECT 1 AS ok FROM users c WHERE c.id = ? AND c.active = 1 AND (
        (? = 'distributor' AND c.distributor_id = ?) OR (? = 'dealer' AND c.id = ?) OR (? = 'sales' AND c.sales_manager_id = ?))`,
      params.id, user.role, user.id, user.role, user.distributor_id ?? -1, user.role, user.id);
    if (!linked) fail(404, "No profile picture.");
    serveAvatar(response, params.id);
  });

  // ---------- Users ----------

  route("GET", "/users", ["admin"], ({ query }) => {
    const role = query.get("role");
    const rows = ROLES.includes(role)
      ? all(`${USER_SELECT} WHERE u.role = ? ORDER BY u.name COLLATE NOCASE`, role)
      : all(`${USER_SELECT} ORDER BY u.role, u.name COLLATE NOCASE`);
    return [200, { users: rows.map(shapeUser) }];
  });

  function userFields(body, existing) {
    const fields = {};
    const needs = (key) => !existing || key in body;
    if (needs("role")) fields.role = oneOf(body.role, ROLES, "Choose a role for this user.");
    if (needs("email")) fields.email = email(body.email);
    if (needs("name")) fields.name = text(body.name, "Name", 2, 100);
    if ("organisation" in body) fields.organisation = text(body.organisation, "Organisation", 0, 120);
    if ("phone" in body) fields.phone = phone(body.phone);
    if ("address" in body) fields.address = text(body.address, "Address", 0, 300);
    if ("state_id" in body) fields.state_id = optionalId(body.state_id, "State");
    if ("distributor_id" in body) fields.distributor_id = optionalId(body.distributor_id, "Distributor");
    if ("sales_manager_id" in body) fields.sales_manager_id = optionalId(body.sales_manager_id, "Sales manager");
    if ("active" in body) fields.active = flag(body.active, "Active");

    // Validate the account as it will be after this change, not just the fields sent.
    const role = fields.role ?? existing.role;
    const stateId = "state_id" in fields ? fields.state_id : existing?.state_id;
    if (stateId && !one("SELECT id FROM states WHERE id = ?", stateId)) fail(400, "The selected state no longer exists.");
    if (PARTNER_ROLES.includes(role) && !stateId) fail(400, "Distributors and dealers must have a state, which decides their regional catalogue.");
    // Each link only makes sense for one role, so it is cleared for every other role. A dealer
    // must always be assigned to a distributor.
    if (role !== "dealer") fields.distributor_id = null;
    else {
      const distributorId = "distributor_id" in fields ? fields.distributor_id : existing?.distributor_id;
      if (!distributorId) fail(400, "Choose the distributor this dealer is assigned to.");
      if (!one("SELECT id FROM users WHERE id = ? AND role = 'distributor' AND active = 1", distributorId)) fail(400, "Assign the dealer to an active distributor.");
    }
    if (role !== "distributor") fields.sales_manager_id = null;
    else if (fields.sales_manager_id && !one("SELECT id FROM users WHERE id = ? AND role = 'sales'", fields.sales_manager_id)) fail(400, "Assign the distributor to an existing area sales manager.");
    return fields;
  }
  const userConflict = (error) => (isUniqueViolation(error) ? fail(409, "An account with this email already exists.") : Promise.reject(error));

  function announceAssignment(dealerId) {
    const dealer = getUser(dealerId);
    const distributor = dealer?.distributor_id && getUser(dealer.distributor_id);
    if (!dealer?.active || !distributor?.active) return;
    notify(emails.dealerAssignedToDistributor({ distributor, dealer, portalUrl }));
    notify(emails.distributorAssignedToDealer({ dealer, distributor, portalUrl }));
  }

  route("POST", "/users", ["admin"], async ({ request }) => {
    const body = await readJson(request);
    const fields = userFields(body, null);
    const supplied = typeof body.password === "string" && body.password !== "";
    const password = supplied ? body.password : temporaryPassword();
    const problem = passwordProblem(password);
    if (problem) fail(400, problem);
    let id;
    try {
      id = insert("users", { ...fields, password_hash: await hashPassword(password), must_change_password: 1 });
    } catch (error) {
      return userConflict(error);
    }
    const user = getUser(id);
    notify(emails.accountCreated({ name: user.name, email: user.email, role: user.role, password, portalUrl }));
    if (user.role === "dealer") notify(emails.dealerAssignedToDistributor({ distributor: getUser(user.distributor_id), dealer: user, portalUrl }));
    // A generated password is returned exactly once, here, so the admin can pass it on.
    return [201, { user, email_sent: mailer.enabled, ...(supplied ? {} : { temporary_password: password }) }];
  });

  route("PATCH", "/users/:id", ["admin"], async ({ request, user, params }) => {
    const existing = one("SELECT * FROM users WHERE id = ?", params.id);
    if (!existing) fail(404, "User not found.");
    const body = await readJson(request);
    const fields = userFields(body, existing);
    if (params.id === user.id && (fields.active === 0 || (fields.role && fields.role !== "admin"))) fail(400, "You cannot deactivate your own account or remove your own admin access.");

    let temporary;
    if (body.reset_password === true) {
      temporary = temporaryPassword();
      Object.assign(fields, { password_hash: await hashPassword(temporary), must_change_password: 1 });
    }
    try {
      transaction(db, () => {
        update("users", params.id, fields);
        const role = fields.role ?? existing.role;
        // When someone stops being a distributor or sales manager, the accounts linked to them
        // are released rather than left pointing at the wrong role.
        if (existing.role === "distributor" && role !== "distributor") run("UPDATE users SET distributor_id = NULL WHERE distributor_id = ?", params.id);
        if (existing.role === "sales" && role !== "sales") run("UPDATE users SET sales_manager_id = NULL WHERE sales_manager_id = ?", params.id);
        if (fields.active === 0 || temporary) run("DELETE FROM sessions WHERE user_id = ?", params.id);
      });
    } catch (error) {
      return userConflict(error);
    }
    const updated = getUser(params.id);
    if (temporary) notify(emails.passwordReset({ name: updated.name, email: updated.email, password: temporary, portalUrl }));
    if (updated.role === "dealer" && updated.distributor_id !== existing.distributor_id) announceAssignment(params.id);
    return [200, { user: updated, email_sent: mailer.enabled, ...(temporary ? { temporary_password: temporary } : {}) }];
  });

  // ---------- Dashboard ----------

  route("GET", "/dashboard", "*", ({ user }) => {
    const recentMaterials = (viewer) => {
      const scope = materialScope(viewer);
      return all(`${MATERIAL_SELECT} WHERE ${scope.where} ORDER BY m.created_at DESC, m.id DESC LIMIT 3`, ...scope.params).map(({ recipient_count: _, ...rest }) => rest);
    };
    const schemesFor = (viewer) => count(`SELECT COUNT(*) AS n FROM schemes sc WHERE ${schemeScope(viewer).where}`, ...schemeScope(viewer).params);
    const materialsFor = (viewer) => count(`SELECT COUNT(*) AS n FROM materials m WHERE ${materialScope(viewer).where}`, ...materialScope(viewer).params);

    if (user.role === "admin") {
      return [200, {
        counts: {
          products: count("SELECT COUNT(*) AS n FROM products"),
          active_products: count("SELECT COUNT(*) AS n FROM products WHERE active = 1"),
          distributors: count("SELECT COUNT(*) AS n FROM users WHERE role = 'distributor' AND active = 1"),
          dealers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'dealer' AND active = 1"),
          sales: count("SELECT COUNT(*) AS n FROM users WHERE role = 'sales' AND active = 1"),
          states: count("SELECT COUNT(*) AS n FROM states WHERE active = 1"),
          materials: count("SELECT COUNT(*) AS n FROM materials"),
          schemes: count(`SELECT COUNT(*) AS n FROM schemes sc WHERE sc.active = 1 AND (sc.ends_on IS NULL OR sc.ends_on >= ${TODAY_IST})`),
          awaiting_first_sign_in: count("SELECT COUNT(*) AS n FROM users WHERE active = 1 AND must_change_password = 1 AND role <> 'admin'"),
        },
        // Where the partner network sits, state by state, for the dashboard chart.
        network: all(`SELECT s.id, s.name,
            COALESCE(SUM(u.role = 'distributor'), 0) AS distributors, COALESCE(SUM(u.role = 'dealer'), 0) AS dealers
          FROM states s LEFT JOIN users u ON u.state_id = s.id AND u.active = 1 AND u.role IN ('distributor', 'dealer')
          WHERE s.active = 1 GROUP BY s.id ORDER BY (COALESCE(SUM(u.role = 'distributor'), 0) + COALESCE(SUM(u.role = 'dealer'), 0)) DESC, s.name COLLATE NOCASE`),
        recent_partners: all(`${USER_SELECT} WHERE u.role IN ('distributor', 'dealer') ORDER BY u.created_at DESC, u.id DESC LIMIT 5`).map(shapeUser),
        region_filter: regionFilterOn() ? "on" : "off",
      }];
    }
    if (user.role === "sales") {
      const distributors = all(`${USER_SELECT} WHERE u.role = 'distributor' AND u.active = 1 AND u.sales_manager_id = ? ORDER BY u.name COLLATE NOCASE`, user.id);
      return [200, {
        counts: { distributors: distributors.length, dealers: distributors.reduce((sum, row) => sum + row.dealer_count, 0) },
        distributors: distributors.slice(0, 6).map((row) => ({ ...contact(row), dealer_count: row.dealer_count })),
      }];
    }
    const counts = { products: visibleProducts(user).length, schemes: schemesFor(user), materials: materialsFor(user) };
    if (user.role === "dealer") {
      const distributor = user.distributor_id ? one(`${USER_SELECT} WHERE u.id = ? AND u.active = 1`, user.distributor_id) : null;
      return [200, { counts, distributor: distributor ? contact(distributor) : null, recent_materials: recentMaterials(user) }];
    }
    const dealers = all(`${USER_SELECT} WHERE u.role = 'dealer' AND u.active = 1 AND u.distributor_id = ? ORDER BY u.created_at DESC, u.id DESC`, user.id);
    return [200, { counts: { ...counts, dealers: dealers.length }, dealers: dealers.slice(0, 5).map(contact), recent_materials: recentMaterials(user) }];
  });

  // ---------- Settings ----------

  route("GET", "/settings", ["admin"], () => [200, { settings: { region_filter: regionFilterOn() ? "on" : "off" }, email_enabled: mailer.enabled }]);

  route("PATCH", "/settings", ["admin"], async ({ request }) => {
    const body = await readJson(request);
    if ("region_filter" in body) run("UPDATE settings SET value = ? WHERE key = 'region_filter'", oneOf(body.region_filter, ["on", "off"], "The region filter must be on or off."));
    return [200, { settings: { region_filter: regionFilterOn() ? "on" : "off" }, email_enabled: mailer.enabled }];
  });

  // ---------- Request handling ----------

  function setCors(request, response) {
    response.setHeader("Vary", "Origin");
    const origin = request.headers.origin;
    if (!origin || !origins.has(origin)) return;
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name");
    response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    response.setHeader("Access-Control-Max-Age", "86400");
  }

  async function handle(request, response) {
    setCors(request, response);
    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        return response.end();
      }
      const url = new URL(request.url ?? "/", "http://portal.local");
      const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
      if (path === "/health") return send(response, 200, { ok: true });
      if (!path.startsWith(`${PREFIX}/`)) fail(404, "Not found.");
      const subPath = path.slice(PREFIX.length);

      let matched;
      let wrongMethod = false;
      for (const candidate of routes) {
        const match = candidate.regex.exec(subPath);
        if (!match) continue;
        if (candidate.method !== request.method) {
          wrongMethod = true;
          continue;
        }
        matched = { route: candidate, params: Object.fromEntries(Object.entries(match.groups ?? {}).map(([key, value]) => [key, Number(value)])) };
        break;
      }
      if (!matched) fail(wrongMethod ? 405 : 404, wrongMethod ? "Method not allowed." : "Not found.");

      const context = { request, response, params: matched.params, query: url.searchParams, user: null, session: null };
      if (matched.route.roles !== null) {
        const auth = authenticate(request);
        // Every protected route answers 401 to a signed-out visitor before any role check, so no
        // product data, price or file is ever reachable without signing in.
        if (!auth) fail(401, "Please sign in to continue.");
        Object.assign(context, auth);
        if (auth.user.must_change_password && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(matched.route.key)) fail(403, "Please change your temporary password before continuing.");
        if (Array.isArray(matched.route.roles) && !matched.route.roles.includes(auth.user.role)) fail(403, "Your account does not have access to this.");
      }
      const result = await matched.route.handler(context);
      if (result) send(response, result[0], result[1]);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      if (error instanceof HttpError) return send(response, error.status, { error: error.message });
      console.error("Portal request failed", { method: request.method, url: request.url, message: error?.message });
      send(response, 500, { error: "Something went wrong. Please try again." });
    }
  }

  return { handle, sweepOrphanFiles, sweepFailures, flushMail };
}
