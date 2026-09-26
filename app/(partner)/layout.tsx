import type { Metadata } from "next";
import "./partner.css";

// The sign-in page and the portal are for registered partners only, so neither is indexed.
export const metadata: Metadata = {
  title: "Partner portal",
  robots: { index: false, follow: false },
};

export default function PartnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
