import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Timestamps are stored as ISO 8601 UTC strings so the browser can parse them directly.
const NOW = "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

// Each entry upgrades the schema by one version; `PRAGMA user_version` records how far a
// database has been migrated. Append new migrations, never edit a released one.
const migrations = [
  `
  CREATE TABLE states (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    code TEXT UNIQUE COLLATE NOCASE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'distributor', 'dealer', 'sales')),
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    organisation TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    state_id INTEGER REFERENCES states(id),
    -- A dealer belongs to one distributor; a distributor reports to one area sales manager.
    distributor_id INTEGER REFERENCES users(id),
    sales_manager_id INTEGER REFERENCES users(id),
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    last_login_at TEXT
  );
  CREATE INDEX users_distributor ON users(distributor_id);
  CREATE INDEX users_sales_manager ON users(sales_manager_id);

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    stored_name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Prices are held in paise so no rupee amount is ever a floating-point value.
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    pack_size TEXT NOT NULL DEFAULT '',
    distributor_price INTEGER NOT NULL CHECK (distributor_price >= 0),
    dealer_price INTEGER NOT NULL CHECK (dealer_price >= 0),
    image_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- The region flag: the states a product is released in. A state cannot be deleted while
  -- any product is flagged for it.
  CREATE TABLE product_states (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE RESTRICT,
    PRIMARY KEY (product_id, state_id)
  );

  CREATE TABLE materials (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL CHECK (audience IN ('all', 'distributor', 'dealer')),
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    file_id INTEGER NOT NULL REFERENCES files(id),
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE schemes (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL CHECK (audience IN ('all', 'distributor', 'dealer')),
    starts_on TEXT,
    ends_on TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    distributor_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'confirmed', 'dispatched', 'delivered', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX orders_distributor ON orders(distributor_id);

  -- Name, code and price are copied onto each line so an order still reads correctly after
  -- the product is renamed, repriced or deleted.
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_code TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL
  );
  CREATE INDEX order_items_order ON order_items(order_id);

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO settings (key, value) VALUES ('region_filter', 'off');
  `,
];

export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: current } = db.prepare("PRAGMA user_version").get();
  for (let version = current; version < migrations.length; version += 1) {
    transaction(db, () => {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
  return db;
}

export function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
