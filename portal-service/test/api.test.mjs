// End-to-end tests of the portal API against a real server and a fresh in-memory database.
// Run with Node 22.13+:  npm test   (from portal-service/)
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createPortal } from "../app.mjs";
import { hashPassword } from "../auth.mjs";
import { openDatabase } from "../db.mjs";

const ORIGIN = "http://localhost:3100";
let server;
let base;
let filesDir;
let portal;
// Captures every notification instead of sending it.
const mailer = { enabled: true, sent: [], async send(message) { this.sent.push(message); } };

before(async () => {
  filesDir = mkdtempSync(join(tmpdir(), "eskay-portal-files-"));
  const db = openDatabase(":memory:");
  portal = createPortal({ db, filesDir, origins: new Set([ORIGIN]), mailer, portalUrl: "https://portal.test" });
  server = createServer(portal.handle);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/v1/portal`;
  db.prepare("INSERT INTO users (role, email, name, password_hash, must_change_password) VALUES ('admin', 'admin@eskay.test', 'Test Admin', ?, 1)").run(await hashPassword("Initial-pass-1"));
});

after(() => {
  server.close();
  rmSync(filesDir, { recursive: true, force: true });
});

async function api(path, { method = "GET", token, body, headers = {}, raw } = {}) {
  const init = { method, headers: { Origin: ORIGIN, ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, init);
  const type = response.headers.get("content-type") ?? "";
  const text = type.includes("json") ? await response.text() : null;
  const bytes = text === null ? Buffer.from(await response.arrayBuffer()) : null;
  return { status: response.status, headers: response.headers, text, bytes, body: text ? JSON.parse(text) : null };
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const upload = (token, name, data) => api("/files", { method: "POST", token, raw: data, headers: { "X-File-Name": encodeURIComponent(name), "Content-Type": "application/octet-stream" } });
// Mail goes out after each request has answered, so it is collected once it has settled.
async function mailTo(address) {
  await portal.flushMail();
  return mailer.sent.filter((message) => message.to === address);
}
const clearMail = () => { mailer.sent.length = 0; };

// Distinct values, so a leaked price is detectable by searching the raw response text.
const DIST_PRICE = 1_234_500;
const DEALER_PRICE = 1_398_700;

test("ESKAY partner portal", async (t) => {
  const tokens = {};
  const ids = {};

  async function onboard(key, role, fields) {
    const created = await api("/users", { method: "POST", token: tokens.admin, body: { role, ...fields } });
    assert.equal(created.status, 201, created.text);
    const login = await api("/auth/login", { method: "POST", body: { email: fields.email, password: created.body.temporary_password } });
    assert.equal(login.status, 200, login.text);
    const changed = await api("/me/password", { method: "POST", token: login.body.token, body: { current_password: created.body.temporary_password, new_password: "Partner-pass-2026" } });
    assert.equal(changed.status, 200, changed.text);
    tokens[key] = login.body.token;
    ids[key] = created.body.user.id;
    return created.body;
  }

  await t.test("signed-out visitors cannot reach any product, price, file or account", async () => {
    for (const path of ["/products", "/products/1", "/products/1/image", "/products/1/images/1", "/materials", "/materials/1/download", "/schemes", "/dashboard", "/me", "/me/avatar", "/users", "/states"]) {
      const response = await api(path);
      assert.equal(response.status, 401, `${path} should require sign-in`);
      assert.deepEqual(Object.keys(response.body), ["error"], `${path} must return nothing but an error`);
    }
  });

  await t.test("the portal takes no orders at all", async () => {
    for (const [method, path] of [["GET", "/orders"], ["POST", "/orders"], ["GET", "/orders/1"], ["PATCH", "/orders/1"]]) {
      assert.equal((await api(path, { method })).status, 404, `${method} ${path} must not exist`);
    }
  });

  await t.test("sign-in rejects wrong credentials with one generic message", async () => {
    const wrongPassword = await api("/auth/login", { method: "POST", body: { email: "admin@eskay.test", password: "nope" } });
    const unknownEmail = await api("/auth/login", { method: "POST", body: { email: "ghost@eskay.test", password: "nope" } });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.error, unknownEmail.body.error, "does not reveal which emails exist");
  });

  await t.test("a temporary password must be changed before anything else is allowed", async () => {
    const login = await api("/auth/login", { method: "POST", body: { email: "admin@eskay.test", password: "Initial-pass-1" } });
    assert.equal(login.body.user.must_change_password, true);
    assert.equal(login.body.user.password_hash, undefined, "the hash is never sent");
    tokens.admin = login.body.token;
    assert.equal((await api("/products", { token: tokens.admin })).status, 403);
    assert.equal((await api("/me/password", { method: "POST", token: tokens.admin, body: { current_password: "Initial-pass-1", new_password: "short" } })).status, 400);
    assert.equal((await api("/me/password", { method: "POST", token: tokens.admin, body: { current_password: "Initial-pass-1", new_password: "Admin-pass-2026" } })).status, 200);
    assert.equal((await api("/products", { token: tokens.admin })).status, 200);
  });

  await t.test("admin manages states, and new states can be added at any time", async () => {
    for (const [key, name, code] of [["uk", "Uttarakhand", "uk"], ["wup", "Western Uttar Pradesh", "WUP"], ["bihar", "Bihar", "BR"]]) {
      const created = await api("/states", { method: "POST", token: tokens.admin, body: { name, code } });
      assert.equal(created.status, 201, created.text);
      ids[key] = created.body.state.id;
    }
    assert.equal((await api("/states", { method: "POST", token: tokens.admin, body: { name: "uttarakhand" } })).status, 409, "names are unique regardless of case");
  });

  await t.test("new accounts are emailed their sign-in details", async () => {
    clearMail();
    const asm = await onboard("asm", "sales", { email: "asm@eskay.test", name: "Area Manager", state_id: ids.uk });
    await onboard("distA", "distributor", { email: "dist.dehradun@eskay.test", name: "Dehradun Distributor", organisation: "Doon Traders", state_id: ids.uk, sales_manager_id: ids.asm });
    await onboard("distB", "distributor", { email: "dist.meerut@eskay.test", name: "Meerut Distributor", state_id: ids.wup });
    assert.equal(asm.email_sent, true);
    const [welcome] = await mailTo("dist.dehradun@eskay.test");
    assert.match(welcome.subject, /partner portal account/);
    assert.match(welcome.text, /Temporary password: \S+/, "the temporary password is in the email");
    assert.match(welcome.text, /https:\/\/portal\.test\/login/, "with a link to sign in");
  });

  await t.test("a dealer must be assigned to a distributor, who is told about it", async () => {
    const withoutDistributor = await api("/users", { method: "POST", token: tokens.admin, body: { role: "dealer", email: "x@eskay.test", name: "Unassigned", state_id: ids.uk } });
    assert.equal(withoutDistributor.status, 400, "no dealer without a distributor");
    assert.match(withoutDistributor.body.error, /distributor/);
    const toSalesManager = await api("/users", { method: "POST", token: tokens.admin, body: { role: "dealer", email: "y@eskay.test", name: "Wrong", state_id: ids.uk, distributor_id: ids.asm } });
    assert.equal(toSalesManager.status, 400, "only a distributor can supply a dealer");

    clearMail();
    await onboard("dealer", "dealer", { email: "dealer.rishikesh@eskay.test", name: "Rishikesh Stores", state_id: ids.uk, distributor_id: ids.distA });
    const [assigned] = await mailTo("dist.dehradun@eskay.test");
    assert.match(assigned.subject, /New dealer assigned: Rishikesh Stores/);

    const mine = await api("/my/dealers", { token: tokens.distA });
    assert.deepEqual(mine.body.dealers.map((d) => d.name), ["Rishikesh Stores"]);
    assert.deepEqual((await api("/my/dealers", { token: tokens.distB })).body.dealers, []);
    const listed = (await api("/users?role=distributor", { token: tokens.admin })).body.users.find((u) => u.id === ids.distA);
    assert.equal(listed.dealer_count, 1, "admins see how many dealers each distributor has");
  });

  await t.test("moving a dealer to another distributor updates both sides and notifies them", async () => {
    clearMail();
    await api(`/users/${ids.dealer}`, { method: "PATCH", token: tokens.admin, body: { distributor_id: ids.distB } });
    assert.deepEqual((await api("/my/dealers", { token: tokens.distA })).body.dealers, []);
    assert.equal((await api("/my/dealers", { token: tokens.distB })).body.dealers.length, 1);
    assert.equal((await mailTo("dist.meerut@eskay.test")).length, 1, "the new distributor is told");
    assert.match((await mailTo("dealer.rishikesh@eskay.test"))[0].subject, /Meerut Distributor/, "and the dealer learns their new distributor");
    await api(`/users/${ids.dealer}`, { method: "PATCH", token: tokens.admin, body: { distributor_id: ids.distA } });
  });

  await t.test("products carry the product master's fields, several images and a region flag", async () => {
    const images = [];
    for (const name of ["box-front.png", "pora.png"]) images.push((await upload(tokens.admin, name, PNG)).body.file.id);
    const box = { name: "Eskay Filter Biri Box 24×20", code: "efb-box", brand: "Eskay Filter Biri", category: "Box", pack_size: "1 pora = 20 boxes × 24 sticks", mrp: 40000, retail_price: 38000, distributor_price: DIST_PRICE, dealer_price: DEALER_PRICE };
    assert.equal((await api("/products", { method: "POST", token: tokens.admin, body: { ...box, state_ids: [] } })).status, 400, "a region is required");
    const p1 = await api("/products", { method: "POST", token: tokens.admin, body: { ...box, state_ids: [ids.uk], image_file_ids: images } });
    assert.equal(p1.status, 201, p1.text);
    assert.equal(p1.body.product.images.length, 2);
    assert.equal(p1.body.product.code, "EFB-BOX");
    ids.p1 = p1.body.product.id;
    ids.p1Images = p1.body.product.images;
    ids.p2 = (await api("/products", { method: "POST", token: tokens.admin, body: { ...box, name: "Eskay Filter Biri Poly 11×20", code: "EFB-POLY", category: "Poly", mrp: 20000, retail_price: 18000, state_ids: [ids.wup] } })).body.product.id;
    ids.p3 = (await api("/products", { method: "POST", token: tokens.admin, body: { ...box, name: "Retired", code: "OLD", active: false, state_ids: [ids.uk] } })).body.product.id;
    assert.equal((await api("/products", { method: "POST", token: tokens.admin, body: { ...box, image_file_ids: [ids.pdfNotYet ?? 999], state_ids: [ids.uk] } })).status, 400);
  });

  await t.test("each role sees only its own price; MRP and retail price are the same for all", async () => {
    const distributor = await api(`/products/${ids.p1}`, { token: tokens.distA });
    assert.equal(distributor.body.product.price, DIST_PRICE);
    assert.equal(distributor.body.product.mrp, 40000);
    assert.equal(distributor.body.product.retail_price, 38000);
    assert.equal(distributor.body.product.brand, "Eskay Filter Biri");
    assert.ok(!distributor.text.includes("dealer_price") && !distributor.text.includes(String(DEALER_PRICE)));
    assert.equal(distributor.body.product.image_file_ids, undefined, "internal file ids stay with admins");
    const dealer = await api("/products", { token: tokens.dealer });
    for (const product of dealer.body.products) assert.equal(product.price, DEALER_PRICE);
    assert.ok(!dealer.text.includes("distributor_price") && !dealer.text.includes(String(DIST_PRICE)));
    assert.equal((await api("/products", { token: tokens.asm })).status, 403, "sales has no product listing");
  });

  await t.test("every product image is served only to those who can see the product", async () => {
    const second = await api(`/products/${ids.p1}/images/${ids.p1Images[1]}`, { token: tokens.dealer });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("content-type"), "image/png");
    assert.equal((await api(`/products/${ids.p1}/images/${ids.p1Images[1]}`)).status, 401);
    assert.equal((await api(`/products/${ids.p2}/images/${ids.p1Images[1]}`, { token: tokens.dealer })).status, 404, "an image is only served through its own product");
  });

  await t.test("the region flag restricts products once switched on", async () => {
    const visible = async (key) => (await api("/products", { token: tokens[key] })).body.products.map((p) => p.id).sort();
    assert.deepEqual(await visible("distA"), [ids.p1, ids.p2].sort(), "off: every active product");
    await api("/settings", { method: "PATCH", token: tokens.admin, body: { region_filter: "on" } });
    assert.deepEqual(await visible("distA"), [ids.p1], "Uttarakhand sees Uttarakhand products");
    assert.deepEqual(await visible("distB"), [ids.p2], "Western UP sees Western UP products");
    assert.equal((await api(`/products/${ids.p2}`, { token: tokens.distA })).status, 404);
    assert.equal((await api("/products", { token: tokens.admin })).body.products.length, 3, "admins are never filtered");
  });

  await t.test("downloadable material reaches exactly the distributors or dealers chosen", async () => {
    const pdf = (await upload(tokens.admin, "Price list.pdf", PDF)).body.file.id;
    assert.equal((await api("/materials", { method: "POST", token: tokens.admin, body: { title: "Wrong role", audience: "distributor", recipient_ids: [ids.dealer], file_id: pdf } })).status, 400, "recipients must hold the audience's role");

    clearMail();
    const onlyA = await api("/materials", { method: "POST", token: tokens.admin, body: { title: "Dehradun terms", audience: "distributor", recipient_ids: [ids.distA], file_id: pdf } });
    assert.equal(onlyA.status, 201, onlyA.text);
    ids.onlyA = onlyA.body.material.id;
    assert.deepEqual(onlyA.body.material.recipients.map((r) => r.id), [ids.distA]);
    const everyDealer = (await api("/materials", { method: "POST", token: tokens.admin, body: { title: "Dealer price list", audience: "dealer", file_id: (await upload(tokens.admin, "dealer.pdf", PDF)).body.file.id } })).body.material;
    ids.everyDealer = everyDealer.id;

    const titles = async (key) => (await api("/materials", { token: tokens[key] })).body.materials.map((m) => m.title).sort();
    assert.deepEqual(await titles("distA"), ["Dehradun terms"]);
    assert.deepEqual(await titles("distB"), [], "a distributor who was not chosen sees nothing");
    assert.deepEqual(await titles("dealer"), ["Dealer price list"], "all dealers, when none are named");
    assert.equal((await api(`/materials/${ids.onlyA}/download`, { token: tokens.distB })).status, 404);
    const download = await api(`/materials/${ids.onlyA}/download`, { token: tokens.distA });
    assert.ok(download.bytes.equals(PDF));
    assert.equal((await api("/materials", { token: tokens.distA })).body.materials[0].recipients, undefined, "partners are not shown who else received it");

    assert.equal((await mailTo("dist.dehradun@eskay.test")).length, 1, "the chosen distributor is emailed");
    assert.equal((await mailTo("dist.meerut@eskay.test")).length, 0, "the other is not");
    assert.equal((await mailTo("dealer.rishikesh@eskay.test")).length, 1, "every dealer hears about an all-dealer document");
  });

  await t.test("adding a recipient later notifies only the newcomer", async () => {
    clearMail();
    const widened = await api(`/materials/${ids.onlyA}`, { method: "PATCH", token: tokens.admin, body: { recipient_ids: [ids.distA, ids.distB] } });
    assert.equal(widened.body.material.recipients.length, 2);
    assert.equal((await mailTo("dist.meerut@eskay.test")).length, 1);
    assert.equal((await mailTo("dist.dehradun@eskay.test")).length, 0, "already had it, so not emailed again");
  });

  await t.test("schemes reach their audience, and new ones are announced", async () => {
    clearMail();
    await api("/schemes", { method: "POST", token: tokens.admin, body: { title: "Distributor scheme", audience: "distributor" } });
    await api("/schemes", { method: "POST", token: tokens.admin, body: { title: "Expired", audience: "all", starts_on: "2020-01-01", ends_on: "2020-12-31" } });
    assert.deepEqual((await api("/schemes", { token: tokens.distA })).body.schemes.map((s) => s.title), ["Distributor scheme"]);
    assert.deepEqual((await api("/schemes", { token: tokens.dealer })).body.schemes, []);
    assert.equal((await mailTo("dist.meerut@eskay.test")).length, 1, "distributors are told about a distributor scheme");
    assert.equal((await mailTo("dealer.rishikesh@eskay.test")).length, 0, "dealers are not, nor about an expired one");
  });

  await t.test("partners can change only their password and picture; admins manage their details", async () => {
    assert.equal((await api("/me", { method: "PATCH", token: tokens.dealer, body: { phone: "+91 98300 12345" } })).status, 403);
    assert.equal((await api("/me", { method: "PATCH", token: tokens.distA, body: { name: "Renamed" } })).status, 403);
    assert.equal((await api("/me", { method: "PATCH", token: tokens.admin, body: { phone: "+91 98300 00000" } })).body.user.phone, "+91 98300 00000");
    const changed = await api(`/users/${ids.dealer}`, { method: "PATCH", token: tokens.admin, body: { email: "rishikesh.stores@eskay.test" } });
    assert.equal(changed.body.user.email, "rishikesh.stores@eskay.test", "the admin can change a partner's email");
    const own = (await api("/me", { token: tokens.admin })).body.user.email;
    assert.equal((await api("/me", { method: "PATCH", token: tokens.admin, body: { email: "rishikesh.stores@eskay.test" } })).status, 409, "an email already in use is refused");
    assert.equal((await api("/me", { method: "PATCH", token: tokens.admin, body: { email: "Head.Office@Eskay.test" } })).body.user.email, "head.office@eskay.test", "admins can change their own email");
    await api("/me", { method: "PATCH", token: tokens.admin, body: { email: own } });
  });

  await t.test("profile pictures: set, shown to linked partners only, and removable", async () => {
    assert.equal((await api("/me/avatar", { method: "POST", token: tokens.distA, raw: Buffer.from("<svg/>"), headers: { "X-File-Name": "me.png" } })).status, 415, "must really be an image");
    const set = await api("/me/avatar", { method: "POST", token: tokens.distA, raw: PNG, headers: { "X-File-Name": "me.png", "Content-Type": "application/octet-stream" } });
    assert.equal(set.body.user.has_avatar, true);
    assert.equal((await api("/me/avatar", { token: tokens.distA })).headers.get("content-type"), "image/png");
    assert.equal((await api(`/contacts/${ids.distA}/avatar`, { token: tokens.dealer })).status, 200, "their dealer sees it");
    assert.equal((await api(`/contacts/${ids.distA}/avatar`, { token: tokens.asm })).status, 200, "their sales manager sees it");
    assert.equal((await api(`/contacts/${ids.distA}/avatar`, { token: tokens.distB })).status, 404, "an unrelated partner does not");
    assert.equal((await api(`/users/${ids.distA}/avatar`, { token: tokens.admin })).status, 200);
    assert.equal((await api("/me/avatar", { method: "DELETE", token: tokens.distA })).body.user.has_avatar, false);
  });

  await t.test("dashboards summarise each role without any order data", async () => {
    const admin = (await api("/dashboard", { token: tokens.admin })).body;
    assert.equal(admin.counts.distributors, 2);
    assert.equal(admin.counts.dealers, 1);
    const uk = admin.network.find((row) => row.name === "Uttarakhand");
    assert.deepEqual({ distributors: uk.distributors, dealers: uk.dealers }, { distributors: 1, dealers: 1 });
    const distributor = (await api("/dashboard", { token: tokens.distA })).body;
    assert.equal(distributor.counts.dealers, 1);
    assert.equal(distributor.counts.materials, 1);
    const dealer = (await api("/dashboard", { token: tokens.dealer })).body;
    assert.equal(dealer.distributor.name, "Dehradun Distributor");
    const sales = (await api("/dashboard", { token: tokens.asm })).body;
    assert.deepEqual(sales.counts, { distributors: 1, dealers: 1 });
    for (const body of [admin, distributor, dealer, sales]) assert.ok(!JSON.stringify(body).includes("order"), "no orders anywhere");
  });

  await t.test("a password reset revokes sessions, forces a change and emails the new password", async () => {
    clearMail();
    const reset = await api(`/users/${ids.distB}`, { method: "PATCH", token: tokens.admin, body: { reset_password: true } });
    assert.ok(reset.body.temporary_password);
    assert.equal((await api("/products", { token: tokens.distB })).status, 401);
    const [message] = await mailTo("dist.meerut@eskay.test");
    assert.match(message.text, new RegExp(reset.body.temporary_password));
  });

  await t.test("deactivating an account signs it out and blocks sign-in", async () => {
    await api(`/users/${ids.dealer}`, { method: "PATCH", token: tokens.admin, body: { active: false } });
    assert.equal((await api("/products", { token: tokens.dealer })).status, 401);
    assert.equal((await api("/auth/login", { method: "POST", body: { email: "rishikesh.stores@eskay.test", password: "Partner-pass-2026" } })).status, 403);
  });

  await t.test("admins cannot lock themselves out", async () => {
    assert.equal((await api("/users/1", { method: "PATCH", token: tokens.admin, body: { active: false } })).status, 400);
  });

  await t.test("uploads are checked against their real contents", async () => {
    assert.equal((await upload(tokens.admin, "brochure.pdf", Buffer.from("<html><script>alert(1)</script>"))).status, 415);
    assert.equal((await upload(tokens.admin, "page.html", Buffer.from("<html>"))).status, 415);
    assert.equal((await upload(tokens.distA, "brochure.pdf", PDF)).status, 403, "only admins upload");
  });

  await t.test("deleting a product removes its images", async () => {
    assert.equal((await api(`/products/${ids.p1}`, { method: "DELETE", token: tokens.admin })).status, 200);
    assert.equal((await api(`/products/${ids.p1}/images/${ids.p1Images[0]}`, { token: tokens.admin })).status, 404);
  });

  await t.test("repeated failed sign-ins are rate limited", async () => {
    let last;
    for (let attempt = 0; attempt < 11; attempt += 1) last = await api("/auth/login", { method: "POST", body: { email: "asm@eskay.test", password: "guess-123" } });
    assert.equal(last.status, 429);
  });

  await t.test("CORS is granted to the site and to no one else", async () => {
    const allowed = await fetch(`${base}/products`, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN);
    const other = await fetch(`${base}/products`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
  });
});
