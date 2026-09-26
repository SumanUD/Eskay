import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(String(password), Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(key, expected);
}

// Checked against when the email is unknown, so a failed login takes the same time whether
// or not the account exists and response timing cannot be used to discover valid emails.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

// Only a SHA-256 of each session token is stored, so a copy of the database cannot be used to
// sign in as anyone.
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");

// Unambiguous characters only (no 0/O, 1/l/I), since these are read out or typed by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const LETTERS = ALPHABET.replace(/\d/g, "");
export function temporaryPassword(length = 12) {
  // Starts with a letter and ends with a digit, so a generated password always satisfies
  // passwordProblem() by construction.
  const middle = Array.from({ length: length - 2 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return LETTERS[randomInt(LETTERS.length)] + middle.join("") + String(randomInt(2, 10));
}

export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 8) return "Passwords must be at least 8 characters.";
  if (password.length > 128) return "Passwords must be 128 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Passwords must include at least one letter and one number.";
  return null;
}
