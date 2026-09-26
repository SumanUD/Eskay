// Creates the first admin account, or resets an existing account to a new temporary admin
// password. Every other account is then created from the admin panel.
//
//   PORTAL_DB=/var/lib/eskay-portal-api/portal.db node create-admin.mjs admin@example.com "Full Name"
//
// The generated password is printed once and must be changed at first sign-in.
import { hashPassword, temporaryPassword } from "./auth.mjs";
import { openDatabase } from "./db.mjs";

const [address, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim() || "ESKAY Admin";
if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
  console.error('Usage: node create-admin.mjs <email> "<full name>"');
  process.exit(1);
}

const db = openDatabase(process.env.PORTAL_DB ?? "/var/lib/eskay-portal-api/portal.db");
const password = temporaryPassword(14);
const hash = await hashPassword(password);
const email = address.toLowerCase();
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

if (existing) {
  db.prepare("UPDATE users SET role = 'admin', password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?").run(hash, existing.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  console.log(`Reset ${email} to admin with a new temporary password.`);
} else {
  db.prepare("INSERT INTO users (role, email, name, password_hash, must_change_password) VALUES ('admin', ?, ?, ?, 1)").run(email, name, hash);
  console.log(`Created admin ${email}.`);
}
console.log(`Temporary password: ${password}`);
console.log("It must be changed at first sign-in.");
