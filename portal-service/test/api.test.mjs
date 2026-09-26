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
let db;
let filesDir;

before(async () => {
  filesDir = mkdtempSync(join(tmpdir(), "eskay-portal-files-"));
  db = openDatabase(":memory:");
  const portal = createPortal({ db, filesDir, origins: new Set([ORIGIN]) });
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

// Distinct values, so a leaked price is detectable by searching the raw response text.
const DIST_PRICE = 1_234_500;
const DEALER_PRICE = 1_398_700;

test("ESKAY partner portal", async (t) => {
  const tokens = {};
  const ids = {};

  async function onboard(key, role, fields) {
    const created = await api("/users", { method: "POST", token: tokens.admin, body: { role, ...fields } });
    assert.equal(created.status, 201, created.text);
    assert.ok(created.body.temporary_password, "a generated password is returned once");
    const login = await api("/auth/login", { method: "POST", body: { email: fields.email, password: created.body.temporary_password } });
    assert.equal(login.status, 200, login.text);
    const changed = await api("/me/password", { method: "POST", token: login.body.token, body: { current_password: created.body.temporary_password, new_password: "Partner-pass-2026" } });
    assert.equal(changed.status, 200, changed.text);
    tokens[key] = login.body.token;
    ids[key] = created.body.user.id;
  }

  await t.test("signed-out visitors cannot reach any product, price, file or order", async () => {
    for (const path of ["/products", "/products/1", "/products/1/image", "/materials", "/materials/1/download", "/schemes", "/orders", "/dashboard", "/me", "/users", "/states"]) {
      const response = await api(path);
      assert.equal(response.status, 401, `${path} should require sign-in`);
      assert.deepEqual(Object.keys(response.body), ["error"], `${path} must return nothing but an error`);
    }
    assert.equal((await api("/products", { token: "not-a-real-token-at-all-000000" })).status, 401);
  });

  await t.test("sign-in rejects wrong credentials with one generic message", async () => {
    const wrongPassword = await api("/auth/login", { method: "POST", body: { email: "admin@eskay.test", password: "nope" } });
    const unknownEmail = await api("/auth/login", { method: "POST", body: { email: "ghost@eskay.test", password: "nope" } });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.body.error, unknownEmail.body.error, "does not reveal which emails exist");
  });

  await t.test("a temporary password must be changed before anything else is allowed", async () => {
    const login = await api("/auth/login", { method: "POST", body: { email: "admin@eskay.test", password: "Initial-pass-1" } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.must_change_password, true);
    assert.equal(login.body.user.password_hash, undefined, "the hash is never sent");
    tokens.admin = login.body.token;
    assert.equal((await api("/products", { token: tokens.admin })).status, 403);
    assert.equal((await api("/me", { token: tokens.admin })).status, 200);
    assert.equal((await api("/me/password", { method: "POST", token: tokens.admin, body: { current_password: "Initial-pass-1", new_password: "short" } })).status, 400);
    assert.equal((await api("/me/password", { method: "POST", token: tokens.admin, body: { current_password: "wrong-one-9", new_password: "Admin-pass-2026" } })).status, 400);
    const changed = await api("/me/password", { method: "POST", token: tokens.admin, body: { current_password: "Initial-pass-1", new_password: "Admin-pass-2026" } });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.must_change_password, false);
    assert.equal((await api("/products", { token: tokens.admin })).status, 200);
  });

  await t.test("admin manages states, and new states can be added at any time", async () => {
    for (const [key, name, code] of [["wb", "West Bengal", "wb"], ["bihar", "Bihar", "BR"], ["odisha", "Odisha", "OD"]]) {
      const created = await api("/states", { method: "POST", token: tokens.admin, body: { name, code } });
      assert.equal(created.status, 201, created.text);
      assert.equal(created.body.state.code, code.toUpperCase());
      ids[key] = created.body.state.id;
    }
    assert.equal((await api("/states", { method: "POST", token: tokens.admin, body: { name: "west bengal" } })).status, 409, "names are unique regardless of case");
    assert.equal((await api("/states", { token: tokens.admin })).body.states.length, 3);
  });

  await t.test("admin creates each kind of account, with the hierarchy validated", async () => {
    await onboard("asm1", "sales", { email: "asm.east@eskay.test", name: "Area Manager East", state_id: ids.wb });
    await onboard("asm2", "sales", { email: "asm.north@eskay.test", name: "Area Manager North", state_id: ids.bihar });
    await onboard("distA", "distributor", { email: "dist.kolkata@eskay.test", name: "Kolkata Distributor", organisation: "Kolkata Traders", state_id: ids.wb, sales_manager_id: ids.asm1 });
    await onboard("distB", "distributor", { email: "dist.patna@eskay.test", name: "Patna Distributor", state_id: ids.bihar, sales_manager_id: ids.asm2 });
    await onboard("dealer", "dealer", { email: "dealer.howrah@eskay.test", name: "Howrah Dealer", state_id: ids.wb, distributor_id: ids.distA });

    const noState = await api("/users", { method: "POST", token: tokens.admin, body: { role: "distributor", email: "x@eskay.test", name: "No State" } });
    assert.equal(noState.status, 400, "distributors need a state for the regional catalogue");
    const wrongParent = await api("/users", { method: "POST", token: tokens.admin, body: { role: "dealer", email: "y@eskay.test", name: "Bad Parent", state_id: ids.wb, distributor_id: ids.asm1 } });
    assert.equal(wrongParent.status, 400, "a dealer can only be assigned to a distributor");
    const duplicate = await api("/users", { method: "POST", token: tokens.admin, body: { role: "sales", email: "ASM.EAST@eskay.test", name: "Dup" } });
    assert.equal(duplicate.status, 409, "emails are unique regardless of case");
    assert.equal((await api("/users", { token: tokens.distA })).status, 403, "only admins manage users");
  });

  await t.test("every product must carry a region flag", async () => {
    const base = { name: "Signature Pack", code: "sig-01", category: "Signature", distributor_price: DIST_PRICE, dealer_price: DEALER_PRICE };
    assert.equal((await api("/products", { method: "POST", token: tokens.admin, body: { ...base, state_ids: [] } })).status, 400);
    assert.equal((await api("/products", { method: "POST", token: tokens.admin, body: base })).status, 400);

    const p1 = await api("/products", { method: "POST", token: tokens.admin, body: { ...base, state_ids: [ids.wb] } });
    assert.equal(p1.status, 201, p1.text);
    assert.equal(p1.body.product.code, "SIG-01");
    ids.p1 = p1.body.product.id;
    const p2 = await api("/products", { method: "POST", token: tokens.admin, body: { ...base, name: "Bihar Classic", code: "CLS-02", state_ids: [ids.bihar, ids.odisha] } });
    ids.p2 = p2.body.product.id;
    const p3 = await api("/products", { method: "POST", token: tokens.admin, body: { ...base, name: "Retired Line", code: "OLD-03", active: false, state_ids: [ids.wb] } });
    ids.p3 = p3.body.product.id;
    assert.equal((await api("/products", { method: "POST", token: tokens.admin, body: { ...base, code: "SIG-01", state_ids: [ids.wb] } })).status, 409);
    assert.equal((await api("/products", { method: "POST", token: tokens.admin, body: { ...base, code: "NEG", distributor_price: -1, state_ids: [ids.wb] } })).status, 400);
    assert.equal((await api("/products", { method: "POST", token: tokens.distA, body: { ...base, code: "HACK", state_ids: [ids.wb] } })).status, 403);
  });

  await t.test("each role sees only its own price; the other price never leaves the server", async () => {
    const distributor = await api("/products", { token: tokens.distA });
    assert.equal(distributor.status, 200);
    for (const product of distributor.body.products) {
      assert.equal(product.price, DIST_PRICE);
      assert.equal(product.price_label, "Distributor price");
    }
    assert.ok(!distributor.text.includes("dealer_price") && !distributor.text.includes(String(DEALER_PRICE)), "dealer price absent from the distributor response");

    const dealer = await api("/products", { token: tokens.dealer });
    for (const product of dealer.body.products) assert.equal(product.price, DEALER_PRICE);
    assert.ok(!dealer.text.includes("distributor_price") && !dealer.text.includes(String(DIST_PRICE)), "distributor price absent from the dealer response");

    const detail = await api(`/products/${ids.p1}`, { token: tokens.dealer });
    assert.ok(!detail.text.includes(String(DIST_PRICE)), "the detail view leaks nothing either");

    const admin = await api("/products", { token: tokens.admin });
    const adminP1 = admin.body.products.find((p) => p.id === ids.p1);
    assert.equal(adminP1.distributor_price, DIST_PRICE);
    assert.equal(adminP1.dealer_price, DEALER_PRICE);
  });

  await t.test("all other product data is the same for every role", async () => {
    const pick = ({ name, code, category, description, pack_size, states }) => ({ name, code, category, description, pack_size, states });
    const asDistributor = (await api(`/products/${ids.p1}`, { token: tokens.distA })).body.product;
    const asDealer = (await api(`/products/${ids.p1}`, { token: tokens.dealer })).body.product;
    assert.deepEqual(pick(asDistributor), pick(asDealer));
  });

  await t.test("inactive products are hidden from partners, and sales has no catalogue", async () => {
    const names = (await api("/products", { token: tokens.distA })).body.products.map((p) => p.id);
    assert.ok(!names.includes(ids.p3));
    assert.equal((await api(`/products/${ids.p3}`, { token: tokens.distA })).status, 404);
    assert.ok((await api("/products", { token: tokens.admin })).body.products.some((p) => p.id === ids.p3), "admins still see it");
    assert.equal((await api("/products", { token: tokens.asm1 })).status, 403);
  });

  await t.test("the region flag restricts the catalogue once switched on", async () => {
    const visible = async (key) => (await api("/products", { token: tokens[key] })).body.products.map((p) => p.id).sort();
    assert.deepEqual(await visible("distA"), [ids.p1, ids.p2].sort(), "off by default: every active product is shown");

    assert.equal((await api("/settings", { method: "PATCH", token: tokens.distA, body: { region_filter: "on" } })).status, 403);
    const on = await api("/settings", { method: "PATCH", token: tokens.admin, body: { region_filter: "on" } });
    assert.equal(on.body.settings.region_filter, "on");

    assert.deepEqual(await visible("distA"), [ids.p1], "West Bengal distributor sees only West Bengal products");
    assert.deepEqual(await visible("dealer"), [ids.p1]);
    assert.deepEqual(await visible("distB"), [ids.p2], "Bihar distributor sees only Bihar products");
    assert.equal((await api(`/products/${ids.p2}`, { token: tokens.distA })).status, 404, "out-of-region products cannot be opened directly");
    assert.equal((await api("/products", { token: tokens.admin })).body.products.length, 3, "admins are never filtered");
  });

  await t.test("distributors order at server-side prices; dealers cannot order", async () => {
    assert.equal((await api("/orders", { method: "POST", token: tokens.dealer, body: { items: [{ product_id: ids.p1, quantity: 1 }] } })).status, 403);
    const order = await api("/orders", { method: "POST", token: tokens.distA, body: { items: [{ product_id: ids.p1, quantity: 2, unit_price: 1 }, { product_id: ids.p1, quantity: 1 }], total: 1, notes: "Urgent" } });
    assert.equal(order.status, 201, order.text);
    assert.equal(order.body.order.total, DIST_PRICE * 3, "client-sent prices are ignored and duplicate lines merged");
    assert.equal(order.body.order.items.length, 1);
    assert.equal(order.body.order.items[0].unit_price, DIST_PRICE);
    ids.orderA = order.body.order.id;

    assert.equal((await api("/orders", { method: "POST", token: tokens.distA, body: { items: [{ product_id: ids.p2, quantity: 1 }] } })).status, 400, "cannot order outside own region");
    assert.equal((await api("/orders", { method: "POST", token: tokens.distA, body: { items: [{ product_id: ids.p3, quantity: 1 }] } })).status, 400, "cannot order an inactive product");
    assert.equal((await api("/orders", { method: "POST", token: tokens.distA, body: { items: [{ product_id: ids.p1, quantity: 0 }] } })).status, 400);
    assert.equal((await api("/orders", { method: "POST", token: tokens.distA, body: { items: [] } })).status, 400);

    const orderB = await api("/orders", { method: "POST", token: tokens.distB, body: { items: [{ product_id: ids.p2, quantity: 5 }] } });
    ids.orderB = orderB.body.order.id;
  });

  await t.test("each role sees exactly the orders it should", async () => {
    const orderIds = async (key) => (await api("/orders", { token: tokens[key] })).body.orders.map((o) => o.id).sort();
    assert.deepEqual(await orderIds("distA"), [ids.orderA], "a distributor sees only their own orders");
    assert.deepEqual(await orderIds("distB"), [ids.orderB]);
    assert.deepEqual(await orderIds("asm1"), [ids.orderA], "an area sales manager sees only their distributors' orders");
    assert.deepEqual(await orderIds("asm2"), [ids.orderB]);
    assert.deepEqual(await orderIds("admin"), [ids.orderA, ids.orderB].sort());
    assert.equal((await api("/orders", { token: tokens.dealer })).status, 403);
    assert.equal((await api(`/orders/${ids.orderB}`, { token: tokens.distA })).status, 404, "another distributor's order cannot be opened");
    assert.equal((await api(`/orders/${ids.orderB}`, { token: tokens.asm1 })).status, 404, "another area's order cannot be opened");
    const detail = await api(`/orders/${ids.orderA}`, { token: tokens.asm1 });
    assert.equal(detail.body.order.distributor, "Kolkata Distributor");
    assert.equal(detail.body.order.items[0].quantity, 3);
  });

  await t.test("order status: admins move it on, distributors may only withdraw an unconfirmed order", async () => {
    assert.equal((await api(`/orders/${ids.orderA}`, { method: "PATCH", token: tokens.distA, body: { status: "confirmed" } })).status, 403);
    assert.equal((await api(`/orders/${ids.orderA}`, { method: "PATCH", token: tokens.asm1, body: { status: "confirmed" } })).status, 403, "sales can view but not change orders");
    const confirmed = await api(`/orders/${ids.orderB}`, { method: "PATCH", token: tokens.admin, body: { status: "confirmed" } });
    assert.equal(confirmed.body.order.status, "confirmed");
    assert.equal((await api(`/orders/${ids.orderB}`, { method: "PATCH", token: tokens.distB, body: { status: "cancelled" } })).status, 403, "too late once confirmed");
    const cancelled = await api(`/orders/${ids.orderA}`, { method: "PATCH", token: tokens.distA, body: { status: "cancelled" } });
    assert.equal(cancelled.body.order.status, "cancelled");
    assert.equal((await api(`/orders/${ids.orderA}`, { method: "PATCH", token: tokens.admin, body: { status: "lost" } })).status, 400);
  });

  await t.test("distributors see their assigned dealers; sales see their distributors", async () => {
    const dealers = await api("/my/dealers", { token: tokens.distA });
    assert.deepEqual(dealers.body.dealers.map((d) => d.name), ["Howrah Dealer"]);
    assert.equal(dealers.body.dealers[0].password_hash, undefined);
    assert.equal(dealers.body.dealers[0].last_login_at, undefined, "only contact details are shared");
    assert.deepEqual((await api("/my/dealers", { token: tokens.distB })).body.dealers, []);
    const distributors = await api("/my/distributors", { token: tokens.asm1 });
    assert.deepEqual(distributors.body.distributors.map((d) => d.name), ["Kolkata Distributor"]);
    assert.equal((await api("/my/dealers", { token: tokens.dealer })).status, 403);
    assert.equal((await api("/my/distributors", { token: tokens.distA })).status, 403);
  });

  await t.test("schemes reach only their audience, and only while running", async () => {
    const make = (title, fields) => api("/schemes", { method: "POST", token: tokens.admin, body: { title, ...fields } });
    await make("Everyone scheme", { audience: "all" });
    await make("Distributor scheme", { audience: "distributor" });
    await make("Dealer scheme", { audience: "dealer", starts_on: "2099-01-01" });
    await make("Expired scheme", { audience: "all", starts_on: "2020-01-01", ends_on: "2020-12-31" });
    await make("Paused scheme", { audience: "all", active: false });
    assert.equal((await make("Backwards", { audience: "all", starts_on: "2026-05-01", ends_on: "2026-04-01" })).status, 400);

    const titles = async (key) => (await api("/schemes", { token: tokens[key] })).body.schemes.map((s) => s.title).sort();
    assert.deepEqual(await titles("distA"), ["Distributor scheme", "Everyone scheme"]);
    assert.deepEqual(await titles("dealer"), ["Dealer scheme", "Everyone scheme"]);
    const upcoming = (await api("/schemes", { token: tokens.dealer })).body.schemes.find((s) => s.title === "Dealer scheme");
    assert.equal(upcoming.status, "upcoming");
    assert.equal((await api("/schemes", { token: tokens.admin })).body.schemes.length, 5);
    assert.equal((await api("/schemes", { token: tokens.asm1 })).status, 403);
  });

  await t.test("uploads are checked against their real contents", async () => {
    assert.equal((await upload(tokens.admin, "brochure.pdf", Buffer.from("<html><script>alert(1)</script>"))).status, 415, "an HTML file renamed .pdf is refused");
    assert.equal((await upload(tokens.admin, "page.html", Buffer.from("<html>"))).status, 415, "unsupported types are refused");
    assert.equal((await upload(tokens.distA, "brochure.pdf", PDF)).status, 403, "only admins upload");
    const ok = await upload(tokens.admin, "Price list 2026.pdf", PDF);
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.body.file.original_name, "Price list 2026.pdf");
    ids.pdf = ok.body.file.id;
  });

  await t.test("downloadable material follows its audience and its product's region", async () => {
    const dealerOnly = await api("/materials", { method: "POST", token: tokens.admin, body: { title: "Dealer price list", audience: "dealer", file_id: ids.pdf } });
    assert.equal(dealerOnly.status, 201, dealerOnly.text);
    ids.dealerMaterial = dealerOnly.body.material.id;
    const biharFile = (await upload(tokens.admin, "bihar.pdf", PDF)).body.file.id;
    const biharOnly = await api("/materials", { method: "POST", token: tokens.admin, body: { title: "Bihar Classic sheet", audience: "all", product_id: ids.p2, file_id: biharFile } });
    ids.biharMaterial = biharOnly.body.material.id;

    const titles = async (key) => (await api("/materials", { token: tokens[key] })).body.materials.map((m) => m.title).sort();
    assert.deepEqual(await titles("dealer"), ["Dealer price list"], "the Bihar sheet is hidden from a West Bengal dealer");
    assert.deepEqual(await titles("distA"), [], "dealer-only material is hidden from distributors");
    assert.deepEqual(await titles("distB"), ["Bihar Classic sheet"]);

    const download = await api(`/materials/${ids.dealerMaterial}/download`, { token: tokens.dealer });
    assert.equal(download.status, 200);
    assert.ok(download.bytes.equals(PDF), "the file comes back byte for byte");
    assert.match(download.headers.get("content-disposition"), /^attachment;/);
    assert.equal(download.headers.get("content-security-policy"), "sandbox");
    assert.equal((await api(`/materials/${ids.dealerMaterial}/download`, { token: tokens.distA })).status, 404);
    assert.equal((await api(`/materials/${ids.dealerMaterial}/download`)).status, 401);
    assert.equal((await api("/materials", { token: tokens.asm1 })).status, 403);
  });

  await t.test("product images are served only to users who can see the product", async () => {
    const image = await upload(tokens.admin, "pack.png", PNG);
    assert.equal(image.status, 201, image.text);
    assert.equal((await api(`/products/${ids.p1}`, { method: "PATCH", token: tokens.admin, body: { image_file_id: ids.pdf } })).status, 400, "a PDF cannot be a product image");
    const set = await api(`/products/${ids.p1}`, { method: "PATCH", token: tokens.admin, body: { image_file_id: image.body.file.id } });
    assert.equal(set.body.product.has_image, true);
    await api(`/products/${ids.p2}`, { method: "PATCH", token: tokens.admin, body: { image_file_id: image.body.file.id } });

    const served = await api(`/products/${ids.p1}/image`, { token: tokens.dealer });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.equal((await api(`/products/${ids.p1}/image`)).status, 401);
    assert.equal((await api(`/products/${ids.p2}/image`, { token: tokens.dealer })).status, 404, "out-of-region images are not served");
  });

  await t.test("dashboards summarise each role's own data", async () => {
    const distributor = (await api("/dashboard", { token: tokens.distA })).body;
    assert.equal(distributor.counts.dealers, 1);
    assert.equal(distributor.counts.products, 1);
    assert.equal(distributor.counts.orders, 1);
    assert.equal(distributor.order_value, 0, "cancelled orders are excluded from order value");
    const sales = (await api("/dashboard", { token: tokens.asm2 })).body;
    assert.equal(sales.counts.distributors, 1);
    assert.equal(sales.counts.open_orders, 1);
    // Chart data follows the same scoping as the orders themselves.
    assert.deepEqual(distributor.insights.status, { placed: 0, confirmed: 0, dispatched: 0, delivered: 0, cancelled: 1 });
    assert.equal(distributor.insights.monthly.length, 6, "six months, current month last");
    assert.match(distributor.insights.monthly[5].month, /^\d{4}-\d{2}$/);
    assert.deepEqual(distributor.insights.monthly.map((m) => m.value), [0, 0, 0, 0, 0, 0], "a cancelled order adds no value");
    assert.equal(sales.insights.status.confirmed, 1);
    assert.equal(sales.insights.status.cancelled, 0, "another area's cancelled order is not counted");
    assert.equal(sales.insights.monthly[5].value, DIST_PRICE * 5, "this month's value is the confirmed Bihar order");
    assert.equal(sales.insights.monthly[5].orders, 1);

    const dealer = (await api("/dashboard", { token: tokens.dealer })).body;
    assert.equal(dealer.recent_orders, undefined, "dealers have no order data");
    assert.equal(dealer.insights, undefined, "nor any order charts");
    assert.equal((await api("/dashboard", { token: tokens.admin })).body.counts.distributors, 2);
  });

  await t.test("profiles: partners edit their contact details but not their role or region", async () => {
    const updated = await api("/me", { method: "PATCH", token: tokens.dealer, body: { phone: "+91 98300 12345", role: "admin", state_id: ids.bihar } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.user.phone, "+91 98300 12345");
    assert.equal(updated.body.user.role, "dealer", "role cannot be self-assigned");
    assert.equal(updated.body.user.state_id, ids.wb, "region cannot be self-assigned");
  });

  await t.test("admins cannot lock themselves out", async () => {
    assert.equal((await api(`/users/${1}`, { method: "PATCH", token: tokens.admin, body: { active: false } })).status, 400);
    assert.equal((await api(`/users/${1}`, { method: "PATCH", token: tokens.admin, body: { role: "dealer", state_id: ids.wb } })).status, 400);
  });

  await t.test("deactivating an account signs it out everywhere", async () => {
    await api(`/users/${ids.dealer}`, { method: "PATCH", token: tokens.admin, body: { active: false } });
    assert.equal((await api("/products", { token: tokens.dealer })).status, 401);
    const login = await api("/auth/login", { method: "POST", body: { email: "dealer.howrah@eskay.test", password: "Partner-pass-2026" } });
    assert.equal(login.status, 403);
  });

  await t.test("a password reset revokes existing sessions and forces a new password", async () => {
    const reset = await api(`/users/${ids.distB}`, { method: "PATCH", token: tokens.admin, body: { reset_password: true } });
    assert.ok(reset.body.temporary_password);
    assert.equal((await api("/orders", { token: tokens.distB })).status, 401);
    const login = await api("/auth/login", { method: "POST", body: { email: "dist.patna@eskay.test", password: reset.body.temporary_password } });
    assert.equal((await api("/orders", { token: login.body.token })).status, 403, "blocked until the temporary password is changed");
  });

  await t.test("deleting a product keeps order history intact", async () => {
    assert.equal((await api(`/products/${ids.p2}`, { method: "DELETE", token: tokens.admin })).status, 200);
    const order = (await api(`/orders/${ids.orderB}`, { token: tokens.admin })).body.order;
    assert.equal(order.items[0].product_name, "Bihar Classic");
    assert.equal(order.items[0].product_id, null);
  });

  await t.test("a state still in use cannot be deleted; an unused one can", async () => {
    assert.equal((await api(`/states/${ids.wb}`, { method: "DELETE", token: tokens.admin })).status, 409);
    const spare = (await api("/states", { method: "POST", token: tokens.admin, body: { name: "Goa" } })).body.state.id;
    assert.equal((await api(`/states/${spare}`, { method: "DELETE", token: tokens.admin })).status, 200);
  });

  await t.test("repeated failed sign-ins are rate limited", async () => {
    let last;
    for (let attempt = 0; attempt < 11; attempt += 1) last = await api("/auth/login", { method: "POST", body: { email: "asm.north@eskay.test", password: "guess-123" } });
    assert.equal(last.status, 429);
    const correct = await api("/auth/login", { method: "POST", body: { email: "asm.north@eskay.test", password: "Partner-pass-2026" } });
    assert.equal(correct.status, 429, "even the right password waits out the lockout");
  });

  await t.test("CORS is granted to the site and to no one else", async () => {
    const allowed = await fetch(`${base}/products`, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), ORIGIN);
    assert.match(allowed.headers.get("access-control-allow-headers"), /Authorization/);
    const other = await fetch(`${base}/products`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
  });
});
