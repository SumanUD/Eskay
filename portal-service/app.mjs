import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DUMMY_HASH, hashPassword, hashToken, newToken, passwordProblem, temporaryPassword, verifyPassword } from "./auth.mjs";
import { transaction } from "./db.mjs";

export const PREFIX = "/v1/portal";

const ROLES = ["admin", "distributor", "dealer", "sales"];
const ORDER_STATUSES = ["placed", "confirmed", "dispatched", "delivered", "cancelled"];
const OPEN_STATUSES = "('placed', 'confirmed', 'dispatched')";
const AUDIENCES = ["all", "distributor", "dealer"];
const PRICE_LABEL = { distributor: "Distributor price", dealer: "Dealer price" };
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_JSON = 64 * 1024;
const MAX_UPLOAD = 25 * 1024 * 1024;
// Caps chosen so the largest possible order total stays inside Number.MAX_SAFE_INTEGER.
const MAX_PRICE_PAISE = 100_000_000;
const MAX_QUANTITY = 100_000;
const MAX_ORDER_LINES = 100;
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
// Scheme dates are Indian calendar days, so "today" is evaluated in IST rather than UTC.
const TODAY_IST = "date('now', '+330 minutes')";

// The MIME type served back is decided here from the extension, never taken from the upload,
// and the first bytes must match it, so a renamed HTML or script file cannot be stored.
const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b;
const UPLOAD_TYPES = {
  pdf: { mime: "application/pdf", check: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  png: { mime: "image/png", check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: "image/webp", check: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
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
function flag(value, field) {
  if (typeof value !== "boolean") fail(400, `${field} must be true or false.`);
  return value ? 1 : 0;
}
function optionalId(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isSafeInteger(value) || value < 1) fail(400, `${field} is not valid.`);
  return value;
}
function day(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) fail(400, `${field} must be a date.`);
  return value;
}
const oneOf = (value, allowed, message) => (allowed.includes(value) ? value : fail(400, message));

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

export function createPortal({ db, filesDir, origins, now = () => Date.now() }) {
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
    return Number(run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((key) => fields[key])).lastInsertRowid);
  }

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
           u.created_at, u.last_login_at
    FROM users u
    LEFT JOIN states s ON s.id = u.state_id
    LEFT JOIN users d ON d.id = u.distributor_id
    LEFT JOIN users m ON m.id = u.sales_manager_id`;
  const shapeUser = (row) => row && { ...row, active: Boolean(row.active), must_change_password: Boolean(row.must_change_password) };
  const getUser = (id) => shapeUser(one(`${USER_SELECT} WHERE u.id = ?`, id));
  // The fields one partner may see about another: contact details only, no account internals.
  const contact = (row) => ({ id: row.id, name: row.name, organisation: row.organisation, email: row.email, phone: row.phone, address: row.address, state: row.state });

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
    return all(`SELECT p.* FROM products p WHERE ${scope.where} ${extra} ORDER BY p.category COLLATE NOCASE, p.name COLLATE NOCASE`, ...scope.params, ...extraParams);
  }
  const visibleProduct = (user, id) => visibleProducts(user, "AND p.id = ?", [id])[0];

  function statesFor(productIds) {
    const byProduct = new Map(productIds.map((id) => [id, []]));
    if (!productIds.length) return byProduct;
    const rows = all("SELECT ps.product_id, s.id, s.name FROM product_states ps JOIN states s ON s.id = ps.state_id ORDER BY s.name COLLATE NOCASE");
    for (const row of rows) byProduct.get(row.product_id)?.push({ id: row.id, name: row.name });
    return byProduct;
  }

  // Each role receives only its own price. The other price is not hidden in the payload, it is
  // never added to it, so it cannot be read from the network tab.
  function shapeProduct(row, user, states) {
    const base = {
      id: row.id, name: row.name, code: row.code, category: row.category, description: row.description,
      pack_size: row.pack_size, has_image: Boolean(row.image_file_id), states: states ?? [], updated_at: row.updated_at,
    };
    if (user.role === "admin") return { ...base, distributor_price: row.distributor_price, dealer_price: row.dealer_price, active: Boolean(row.active) };
    return { ...base, price: row[`${user.role}_price`], price_label: PRICE_LABEL[user.role] };
  }
  function shapeProducts(rows, user) {
    const states = statesFor(rows.map((row) => row.id));
    return rows.map((row) => shapeProduct(row, user, states.get(row.id)));
  }

  function stateList(value) {
    if (!Array.isArray(value) || !value.length) fail(400, "Choose at least one state for this product.");
    const ids = [...new Set(value.map((item) => optionalId(item, "State")))];
    if (ids.includes(null)) fail(400, "Choose at least one state for this product.");
    const found = count(`SELECT COUNT(*) AS n FROM states WHERE id IN (${ids.map(() => "?").join(", ")})`, ...ids);
    if (found !== ids.length) fail(400, "One of the selected states no longer exists.");
    return ids;
  }
  function setProductStates(productId, stateIds) {
    run("DELETE FROM product_states WHERE product_id = ?", productId);
    for (const stateId of stateIds) run("INSERT INTO product_states (product_id, state_id) VALUES (?, ?)", productId, stateId);
  }

  // ---------- Files ----------

  function imageFile(value) {
    const fileId = optionalId(value, "Image");
    if (fileId === null) return null;
    const file = one("SELECT mime FROM files WHERE id = ?", fileId);
    if (!file) fail(400, "The uploaded image could not be found.");
    if (!file.mime.startsWith("image/")) fail(400, "Product images must be PNG, JPEG or WebP.");
    return fileId;
  }
  async function removeFileIfUnused(fileId) {
    if (!fileId) return;
    const used = count("SELECT (SELECT COUNT(*) FROM products WHERE image_file_id = ?) + (SELECT COUNT(*) FROM materials WHERE file_id = ?) AS n", fileId, fileId);
    if (used) return;
    const file = one("SELECT stored_name FROM files WHERE id = ?", fileId);
    if (!file) return;
    run("DELETE FROM files WHERE id = ?", fileId);
    await rm(join(filesDir, file.stored_name), { force: true });
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
      AND id NOT IN (SELECT image_file_id FROM products WHERE image_file_id IS NOT NULL) AND id NOT IN (SELECT file_id FROM materials)`);
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

  route("PATCH", "/me", "*", async ({ request, user }) => {
    const body = await readJson(request);
    const fields = {};
    if ("name" in body) fields.name = text(body.name, "Name", 2, 100);
    if ("organisation" in body) fields.organisation = text(body.organisation, "Organisation", 0, 120);
    if ("phone" in body) fields.phone = phone(body.phone);
    if ("address" in body) fields.address = text(body.address, "Address", 0, 300);
    update("users", user.id, fields);
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

  // ---------- Dashboard ----------

  // Where a role's orders stand and how their value has moved, for the dashboard charts. Months
  // are Indian calendar months; the value and order count exclude cancelled orders.
  function orderInsights(user) {
    const scope = orderScope(user);
    const status = Object.fromEntries(ORDER_STATUSES.map((name) => [name, 0]));
    for (const row of all(`SELECT o.status, COUNT(*) AS n FROM orders o JOIN users d ON d.id = o.distributor_id WHERE ${scope.where} GROUP BY o.status`, ...scope.params)) status[row.status] = row.n;

    const today = new Date(now() + 330 * 60 * 1000);
    const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 7));
    const since = new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - 330 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const totals = new Map(all(`SELECT strftime('%Y-%m', o.created_at, '+330 minutes') AS month, COUNT(*) AS orders, SUM(o.total) AS value
      FROM orders o JOIN users d ON d.id = o.distributor_id
      WHERE ${scope.where} AND o.status <> 'cancelled' AND o.created_at >= ? GROUP BY month`, ...scope.params, since).map((row) => [row.month, row]));
    return { status, monthly: months.map((month) => ({ month, orders: totals.get(month)?.orders ?? 0, value: totals.get(month)?.value ?? 0 })) };
  }

  route("GET", "/dashboard", "*", ({ user }) => {
    const recent = (where, ...params) => all(`${ORDER_SELECT} WHERE ${where} ORDER BY o.id DESC LIMIT 5`, ...params);
    if (user.role === "admin") {
      return [200, {
        counts: {
          products: count("SELECT COUNT(*) AS n FROM products"),
          active_products: count("SELECT COUNT(*) AS n FROM products WHERE active = 1"),
          distributors: count("SELECT COUNT(*) AS n FROM users WHERE role = 'distributor' AND active = 1"),
          dealers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'dealer' AND active = 1"),
          sales: count("SELECT COUNT(*) AS n FROM users WHERE role = 'sales' AND active = 1"),
          states: count("SELECT COUNT(*) AS n FROM states WHERE active = 1"),
          open_orders: count(`SELECT COUNT(*) AS n FROM orders WHERE status IN ${OPEN_STATUSES}`),
        },
        recent_orders: recent("1 = 1"),
        region_filter: regionFilterOn() ? "on" : "off",
        insights: orderInsights(user),
      }];
    }
    if (user.role === "sales") {
      return [200, {
        counts: {
          distributors: count("SELECT COUNT(*) AS n FROM users WHERE role = 'distributor' AND active = 1 AND sales_manager_id = ?", user.id),
          open_orders: count(`SELECT COUNT(*) AS n FROM orders o JOIN users d ON d.id = o.distributor_id WHERE d.sales_manager_id = ? AND o.status IN ${OPEN_STATUSES}`, user.id),
          orders: count("SELECT COUNT(*) AS n FROM orders o JOIN users d ON d.id = o.distributor_id WHERE d.sales_manager_id = ?", user.id),
        },
        recent_orders: recent("d.sales_manager_id = ?", user.id),
        insights: orderInsights(user),
      }];
    }
    const counts = {
      products: visibleProducts(user).length,
      schemes: count(`SELECT COUNT(*) AS n FROM schemes sc WHERE ${schemeScope(user).where}`, ...schemeScope(user).params),
      materials: count(`SELECT COUNT(*) AS n FROM materials m WHERE ${materialScope(user).where}`, ...materialScope(user).params),
    };
    if (user.role === "dealer") return [200, { counts }];
    return [200, {
      counts: {
        ...counts,
        dealers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'dealer' AND active = 1 AND distributor_id = ?", user.id),
        open_orders: count(`SELECT COUNT(*) AS n FROM orders WHERE distributor_id = ? AND status IN ${OPEN_STATUSES}`, user.id),
        orders: count("SELECT COUNT(*) AS n FROM orders WHERE distributor_id = ?", user.id),
      },
      order_value: count("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE distributor_id = ? AND status <> 'cancelled'", user.id),
      recent_orders: recent("o.distributor_id = ?", user.id),
      insights: orderInsights(user),
    }];
  });

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
    return [200, { product: shapeProduct(row, user, statesFor([row.id]).get(row.id)), materials }];
  });

  route("GET", "/products/:id/image", CATALOGUE_ROLES, ({ user, params, response }) => {
    const row = visibleProduct(user, params.id);
    const file = row?.image_file_id && one("SELECT * FROM files WHERE id = ?", row.image_file_id);
    if (!file) fail(404, "Image not found.");
    sendFile(response, file, { download: false });
  });

  function productFields(body, partial) {
    const fields = {};
    const needs = (key) => !partial || key in body;
    if (needs("name")) fields.name = text(body.name, "Product name", 2, 120);
    if (needs("code")) fields.code = text(body.code, "Product code", 1, 40).toUpperCase();
    if ("category" in body) fields.category = text(body.category, "Category", 0, 60);
    if ("description" in body) fields.description = text(body.description, "Description", 0, 5000);
    if ("pack_size" in body) fields.pack_size = text(body.pack_size, "Pack size", 0, 60);
    if (needs("distributor_price")) fields.distributor_price = paise(body.distributor_price, "Distributor price");
    if (needs("dealer_price")) fields.dealer_price = paise(body.dealer_price, "Dealer price");
    if ("active" in body) fields.active = flag(body.active, "Active");
    if ("image_file_id" in body) fields.image_file_id = imageFile(body.image_file_id);
    const stateIds = needs("state_ids") ? stateList(body.state_ids) : undefined;
    return { fields, stateIds };
  }
  const productConflict = (error) => (isUniqueViolation(error) ? fail(409, "A product with this code already exists.") : Promise.reject(error));
  const adminProduct = (id) => {
    const row = one("SELECT * FROM products WHERE id = ?", id);
    return shapeProduct(row, { role: "admin" }, statesFor([id]).get(id));
  };

  route("POST", "/products", ["admin"], async ({ request }) => {
    const { fields, stateIds } = productFields(await readJson(request), false);
    try {
      const id = transaction(db, () => {
        const productId = insert("products", fields);
        setProductStates(productId, stateIds);
        return productId;
      });
      return [201, { product: adminProduct(id) }];
    } catch (error) {
      return productConflict(error);
    }
  });

  route("PATCH", "/products/:id", ["admin"], async ({ request, params }) => {
    const existing = one("SELECT image_file_id FROM products WHERE id = ?", params.id);
    if (!existing) fail(404, "Product not found.");
    const { fields, stateIds } = productFields(await readJson(request), true);
    try {
      transaction(db, () => {
        update("products", params.id, fields, { touch: true });
        if (stateIds) setProductStates(params.id, stateIds);
      });
    } catch (error) {
      return productConflict(error);
    }
    if ("image_file_id" in fields && fields.image_file_id !== existing.image_file_id) await removeFileIfUnused(existing.image_file_id);
    return [200, { product: adminProduct(params.id) }];
  });

  route("DELETE", "/products/:id", ["admin"], async ({ params }) => {
    const existing = one("SELECT image_file_id FROM products WHERE id = ?", params.id);
    if (!existing) fail(404, "Product not found.");
    // Past orders keep their copied name, code and price; only the link to the product is cleared.
    run("DELETE FROM products WHERE id = ?", params.id);
    await removeFileIfUnused(existing.image_file_id);
    return [200, { ok: true }];
  });

  // ---------- Uploads ----------

  route("POST", "/files", ["admin"], async ({ request }) => {
    let name;
    try {
      name = decodeURIComponent(String(request.headers["x-file-name"] ?? ""));
    } catch {
      fail(400, "The file name could not be read.");
    }
    name = name.replace(/[\\/\r\n\0]/g, "_").trim().slice(-150);
    if (!name) fail(400, "A file name is required.");
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const type = Object.hasOwn(UPLOAD_TYPES, extension) ? UPLOAD_TYPES[extension] : null;
    if (!type) fail(415, "Upload a PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint, CSV or ZIP file.");
    const data = await readRaw(request, MAX_UPLOAD);
    if (!data.length) fail(400, "The file is empty.");
    if (!type.check(data)) fail(415, `This file does not look like a real .${extension} file.`);
    const storedName = `${randomBytes(16).toString("hex")}.${extension}`;
    await writeFile(join(filesDir, storedName), data, { flag: "wx" });
    const id = insert("files", { stored_name: storedName, original_name: name, mime: type.mime, size: data.length });
    return [201, { file: { id, original_name: name, mime: type.mime, size: data.length } }];
  });

  // ---------- Downloadable material ----------

  const MATERIAL_SELECT = `
    SELECT m.id, m.title, m.description, m.audience, m.product_id, lp.name AS product,
           f.original_name AS file_name, f.mime AS file_mime, f.size AS file_size, m.created_at
    FROM materials m JOIN files f ON f.id = m.file_id LEFT JOIN products lp ON lp.id = m.product_id`;

  // Material follows its audience, and material attached to a product is hidden wherever that
  // product is hidden, so the region flag governs both.
  function materialScope(user) {
    if (user.role === "admin") return { where: "1 = 1", params: [] };
    const products = productScope(user);
    return {
      where: `m.audience IN ('all', ?) AND (m.product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id = m.product_id AND ${products.where}))`,
      params: [user.role, ...products.params],
    };
  }
  const CONTENT_ROLES = ["admin", "distributor", "dealer"];

  route("GET", "/materials", CONTENT_ROLES, ({ user }) => {
    const scope = materialScope(user);
    return [200, { materials: all(`${MATERIAL_SELECT} WHERE ${scope.where} ORDER BY m.created_at DESC, m.id DESC`, ...scope.params) }];
  });

  route("GET", "/materials/:id/download", CONTENT_ROLES, ({ user, params, response }) => {
    const scope = materialScope(user);
    const file = one(`SELECT f.* FROM materials m JOIN files f ON f.id = m.file_id WHERE m.id = ? AND ${scope.where}`, params.id, ...scope.params);
    if (!file) fail(404, "File not found.");
    sendFile(response, file, { download: true });
  });

  function materialFields(body, partial) {
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
    return fields;
  }
  const getMaterial = (id) => one(`${MATERIAL_SELECT} WHERE m.id = ?`, id);

  route("POST", "/materials", ["admin"], async ({ request }) => [201, { material: getMaterial(insert("materials", materialFields(await readJson(request), false))) }]);

  route("PATCH", "/materials/:id", ["admin"], async ({ request, params }) => {
    const existing = one("SELECT file_id FROM materials WHERE id = ?", params.id);
    if (!existing) fail(404, "Material not found.");
    const fields = materialFields(await readJson(request), true);
    update("materials", params.id, fields);
    if (fields.file_id && fields.file_id !== existing.file_id) await removeFileIfUnused(existing.file_id);
    return [200, { material: getMaterial(params.id) }];
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

  route("POST", "/schemes", ["admin"], async ({ request }) => [201, { scheme: getScheme(insert("schemes", schemeFields(await readJson(request), false))) }]);

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

  // ---------- Orders ----------

  const ORDER_SELECT = `
    SELECT o.id, o.distributor_id, d.name AS distributor, d.organisation AS distributor_organisation,
           s.name AS state, o.status, o.notes, o.total, o.created_at, o.updated_at,
           (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
    FROM orders o JOIN users d ON d.id = o.distributor_id LEFT JOIN states s ON s.id = d.state_id`;

  // Distributors see their own orders; area sales managers see the orders of the distributors
  // assigned to them; admins see every order.
  function orderScope(user) {
    if (user.role === "admin") return { where: "1 = 1", params: [] };
    if (user.role === "distributor") return { where: "o.distributor_id = ?", params: [user.id] };
    return { where: "d.sales_manager_id = ?", params: [user.id] };
  }
  const ORDER_ROLES = ["admin", "distributor", "sales"];
  function scopedOrder(user, id) {
    const scope = orderScope(user);
    return one(`${ORDER_SELECT} WHERE o.id = ? AND ${scope.where}`, id, ...scope.params);
  }
  const orderWithItems = (order) => ({
    ...order,
    items: all("SELECT id, product_id, product_name, product_code, quantity, unit_price, quantity * unit_price AS line_total FROM order_items WHERE order_id = ? ORDER BY id", order.id),
  });

  route("GET", "/orders", ORDER_ROLES, ({ user, query }) => {
    const scope = orderScope(user);
    const status = query.get("status");
    const filter = status && ORDER_STATUSES.includes(status) ? "AND o.status = ?" : "";
    const params = filter ? [...scope.params, status] : scope.params;
    return [200, { orders: all(`${ORDER_SELECT} WHERE ${scope.where} ${filter} ORDER BY o.id DESC`, ...params) }];
  });

  route("GET", "/orders/:id", ORDER_ROLES, ({ user, params }) => {
    const order = scopedOrder(user, params.id);
    if (!order) fail(404, "Order not found.");
    return [200, { order: orderWithItems(order) }];
  });

  route("POST", "/orders", ["distributor"], async ({ request, user }) => {
    const body = await readJson(request);
    if (!Array.isArray(body.items) || !body.items.length) fail(400, "Add at least one product to the order.");
    if (body.items.length > MAX_ORDER_LINES) fail(400, `An order can hold up to ${MAX_ORDER_LINES} products.`);
    const quantities = new Map();
    for (const item of body.items) {
      const productId = optionalId(item?.product_id, "Product");
      if (!productId || !Number.isInteger(item.quantity) || item.quantity < 1) fail(400, "Each line needs a product and a quantity of at least 1.");
      quantities.set(productId, (quantities.get(productId) ?? 0) + item.quantity);
    }
    for (const quantity of quantities.values()) if (quantity > MAX_QUANTITY) fail(400, `Quantities can be at most ${MAX_QUANTITY.toLocaleString("en-IN")} per product.`);
    const notes = text(body.notes, "Notes", 0, 1000);

    // Prices come from the database at the moment of ordering; the client never sends one.
    const orderId = transaction(db, () => {
      const lines = [...quantities].map(([productId, quantity]) => {
        const product = visibleProduct(user, productId);
        if (!product) fail(400, "One of these products is no longer available. Please refresh the catalogue.");
        return { product, quantity };
      });
      const total = lines.reduce((sum, { product, quantity }) => sum + product.distributor_price * quantity, 0);
      const id = insert("orders", { distributor_id: user.id, notes, total });
      for (const { product, quantity } of lines) {
        insert("order_items", { order_id: id, product_id: product.id, product_name: product.name, product_code: product.code, quantity, unit_price: product.distributor_price });
      }
      return id;
    });
    return [201, { order: orderWithItems(scopedOrder(user, orderId)) }];
  });

  route("PATCH", "/orders/:id", ["admin", "distributor"], async ({ request, user, params }) => {
    const order = scopedOrder(user, params.id);
    if (!order) fail(404, "Order not found.");
    const status = oneOf((await readJson(request)).status, ORDER_STATUSES, "Choose a valid order status.");
    // A distributor can withdraw an order only until ESKAY has confirmed it.
    if (user.role === "distributor" && (status !== "cancelled" || order.status !== "placed")) fail(403, "An order can only be cancelled before ESKAY confirms it.");
    update("orders", params.id, { status }, { touch: true });
    return [200, { order: orderWithItems(scopedOrder(user, params.id)) }];
  });

  // ---------- Own network ----------

  route("GET", "/my/dealers", ["distributor"], ({ user }) => [200, {
    dealers: all(`${USER_SELECT} WHERE u.role = 'dealer' AND u.active = 1 AND u.distributor_id = ? ORDER BY u.name COLLATE NOCASE`, user.id).map(contact),
  }]);

  route("GET", "/my/distributors", ["sales"], ({ user }) => [200, {
    distributors: all(`${USER_SELECT} WHERE u.role = 'distributor' AND u.active = 1 AND u.sales_manager_id = ? ORDER BY u.name COLLATE NOCASE`, user.id).map((row) => ({
      ...contact(row),
      open_orders: count(`SELECT COUNT(*) AS n FROM orders WHERE distributor_id = ? AND status IN ${OPEN_STATUSES}`, row.id),
      orders: count("SELECT COUNT(*) AS n FROM orders WHERE distributor_id = ?", row.id),
    })),
  }]);

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
    if ((role === "distributor" || role === "dealer") && !stateId) fail(400, "Distributors and dealers must have a state, which decides their regional catalogue.");
    // Each link only makes sense for one role, so it is cleared for every other role.
    if (role !== "dealer") fields.distributor_id = null;
    else if (fields.distributor_id && !one("SELECT id FROM users WHERE id = ? AND role = 'distributor'", fields.distributor_id)) fail(400, "Assign the dealer to an existing distributor.");
    if (role !== "distributor") fields.sales_manager_id = null;
    else if (fields.sales_manager_id && !one("SELECT id FROM users WHERE id = ? AND role = 'sales'", fields.sales_manager_id)) fail(400, "Assign the distributor to an existing area sales manager.");
    return fields;
  }
  const userConflict = (error) => (isUniqueViolation(error) ? fail(409, "An account with this email already exists.") : Promise.reject(error));

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
    // A generated password is returned exactly once, here, so the admin can pass it on.
    return [201, { user: getUser(id), ...(supplied ? {} : { temporary_password: password }) }];
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
    return [200, { user: getUser(params.id), ...(temporary ? { temporary_password: temporary } : {}) }];
  });

  // ---------- Settings ----------

  route("GET", "/settings", ["admin"], () => [200, { settings: { region_filter: regionFilterOn() ? "on" : "off" } }]);

  route("PATCH", "/settings", ["admin"], async ({ request }) => {
    const body = await readJson(request);
    if ("region_filter" in body) run("UPDATE settings SET value = ? WHERE key = 'region_filter'", oneOf(body.region_filter, ["on", "off"], "The region filter must be on or off."));
    return [200, { settings: { region_filter: regionFilterOn() ? "on" : "off" } }];
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

  return { handle, sweepOrphanFiles, sweepFailures };
}
