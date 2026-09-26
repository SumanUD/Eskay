import type { ReactNode } from "react";

// Line icons for the portal, drawn on the same 24px grid and 1.8 stroke as the public site's set.
const paths = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></>,
  catalogue: <><path d="M3.5 5.5c2.6-1.3 5.4-1 8.5 1v13c-3.1-2-5.9-2.3-8.5-1v-13Z" /><path d="M20.5 5.5c-2.6-1.3-5.4-1-8.5 1v13c3.1-2 5.9-2.3 8.5-1v-13Z" /></>,
  cart: <><path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c2.1.6 3.5 2.5 3.5 5.2" /></>,
  truck: <><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.2 6.2a1.4 1.4 0 0 1-2 0l-8.8-7.8Z" /><circle cx="8" cy="8" r="1.4" /></>,
  download: <><path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" /><path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  box: <><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z" /><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c.6-3.9 3.6-6.3 7.5-6.3s6.9 2.4 7.5 6.3" /></>,
  signout: <><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>,
  back: <><path d="M14.5 6 8.5 12l6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" /></>,
  rupee: <><path d="M7 5h10M7 9h10M7 5h3.5a4 4 0 0 1 0 8H7l7.5 7" /></>,
  spark: <><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M18 6l-2.6 2.6M8.6 15.4 6 18" /></>,
} satisfies Record<string, ReactNode>;

export type PortalIconName = keyof typeof paths;

export function Icon({ name, className = "p-icon" }: { name: PortalIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24">{paths[name]}</svg>;
}
