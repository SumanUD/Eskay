import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ESKAY — Experience. Knowledge. Evolution.",
    template: "%s — ESKAY",
  },
  description:
    "ESKAY corporate information, stakeholder services, customer care and business enquiries.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1ea",
};

// The public site and the partner portal each bring their own chrome from their route group;
// this root layout only provides the document.
//
// `data-scroll-behavior` lets Next jump straight to the top on route changes. Without it,
// Next 16 leaves the stylesheet's smooth scrolling in place and every page change would
// glide up from wherever the reader was, while in-page anchor links stay smooth either way.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
