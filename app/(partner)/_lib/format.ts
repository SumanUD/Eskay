import type { Audience, OrderStatus, Role } from "./types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** Amounts are held in paise everywhere, and only become rupees at the point of display. */
export const rupees = (paise: number) => inr.format(paise / 100);

// Admins type rupees; the API stores paise. Rounding after scaling avoids 19.99 -> 1998.
export function toPaise(value: string): number | null {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
export const toRupeeInput = (paise: number) => (paise / 100).toFixed(2);

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTimeFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
// A scheme date is a calendar day with no time, so it is read as that day, not as UTC midnight.
export const formatDay = (day: string) => dateFormat.format(new Date(`${day}T12:00:00+05:30`));

export function schemePeriod({ starts_on, ends_on }: { starts_on: string | null; ends_on: string | null }) {
  if (starts_on && ends_on) return `${formatDay(starts_on)} – ${formatDay(ends_on)}`;
  if (starts_on) return `From ${formatDay(starts_on)}`;
  if (ends_on) return `Until ${formatDay(ends_on)}`;
  return "Ongoing";
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  distributor: "Distributor",
  dealer: "Dealer",
  sales: "Area Sales Manager",
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "Distributors and dealers",
  distributor: "Distributors only",
  dealer: "Dealers only",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
