export type NavItem = {
  href: string;
  /** Full name, used in the expanded menu and footer. */
  label: string;
  /** Compact name for the inline desktop navigation, where space is tight. */
  short: string;
};

export const siteNav: NavItem[] = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/our-story", label: "Our Story", short: "Our Story" },
  { href: "/eskay-world", label: "The ESKAY World", short: "ESKAY World" },
  { href: "/collections", label: "Collections", short: "Collections" },
  { href: "/accessories", label: "Accessories", short: "Accessories" },
  { href: "/innovation", label: "Innovation & Craftsmanship", short: "Innovation" },
  { href: "/business-network", label: "Business Network", short: "Business" },
  { href: "/contact", label: "Contact", short: "Contact" },
];

// Home is reached through the logo and Contact through the header button, so the inline
// desktop navigation carries only the sections in between.
export const primaryNav = siteNav.filter((item) => item.href !== "/" && item.href !== "/contact");
