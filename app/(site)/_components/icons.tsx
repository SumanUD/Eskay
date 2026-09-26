import type { ReactNode } from "react";

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={diagonal ? "M6 18 18 6M8 6h10v10" : "M5 12h14M14 7l5 5-5 5"} />
    </svg>
  );
}

const paths = {
  experience: <><circle cx="10" cy="8" r="4" /><path d="M3 21c0-4 3-7 7-7 2 0 3.6.6 5 1.8M17 13l1.4 2.2 2.6.5-1.8 2 .3 2.7-2.5-1.1-2.4 1.1.3-2.7-1.9-2 2.7-.5L17 13Z" /></>,
  knowledge: <><path d="M3 5.5c3-1.5 6-1 9 1v14c-3-2-6-2.5-9-1V5.5ZM21 5.5c-3-1.5-6-1-9 1v14c3-2 6-2.5 9-1V5.5Z" /></>,
  evolution: <><path d="M4 20V11M10 20V7M16 20V3M2 20h20M3 8l5-4 4 2 8-5" /><path d="M16 1h4v4" /></>,
  conversation: <><path d="M4 17.5 2 22l5-2c1.3.6 2.8 1 4.5 1 5.2 0 9.5-3.6 9.5-8s-4.3-8-9.5-8S2 8.6 2 13c0 1.7.7 3.2 2 4.5Z" /><path d="M8 12h7M8 15h4" /></>,
  support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13a2 2 0 0 0 0 4h2v-6H4v2ZM20 13a2 2 0 0 1 0 4h-2v-6h2v2ZM18 18c-1 2-3 3-6 3" /></>,
  business: <><rect x="3" y="7" width="18" height="13" rx="1" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></>,
  layers: <><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  leaf: <><path d="M5 19c0-8 5-13 15-14 0 10-5 15-13 15-1 0-2-.4-2-1Z" /><path d="M5 19c3-4 6-6 10-8" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></>,
  package: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  bulb: <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3Z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  truck: <><path d="M2 6h11v10H2ZM13 10h4l4 4v2h-8" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  store: <><path d="M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" /></>,
  bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.4.6 4 2.6 4 6" /></>,
  pen: <><path d="m15 4 5 5L9 20H4v-5L15 4Z" /><path d="m12 7 5 5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3 7 9 6 9-6" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function LineIcon({ type }: { type: IconName }) {
  return <svg aria-hidden="true" className="line-icon" viewBox="0 0 24 24">{paths[type]}</svg>;
}
