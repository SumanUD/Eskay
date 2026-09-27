"use client";

import { useState } from "react";
import type { NetworkRow } from "./types";

const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

const SERIES = [
  { key: "distributors", label: "Distributors", one: "distributor" },
  { key: "dealers", label: "Dealers", one: "dealer" },
] as const;

/**
 * Active partners per state, as paired horizontal bars: state names read in full, and every bar
 * carries its count, so the two series never have to be told apart by colour alone.
 */
export function NetworkChart({ rows }: { rows: NetworkRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = rows.filter((row) => row.distributors + row.dealers > 0);
  const top = Math.max(1, ...shown.flatMap((row) => [row.distributors, row.dealers]));
  const totals = shown.reduce((sum, row) => ({ distributors: sum.distributors + row.distributors, dealers: sum.dealers + row.dealers }), { distributors: 0, dealers: 0 });

  return (
    <figure className="p-chart">
      <figcaption className="p-chart-head">
        <h2>Partner network by state</h2>
        <p>Active distributors and dealers, by the state they are registered in</p>
      </figcaption>
      {!shown.length ? (
        <p className="p-chart-empty">No active partners yet. As you add distributors and dealers, each state&apos;s network shows here.</p>
      ) : (
        <>
          <ul className="p-legend is-inline" aria-hidden="true">
            {SERIES.map((series) => (
              <li key={series.key}>
                <i className={`p-legend-dot series-${series.key}`} />
                <span>{series.label}</span>
                <strong>{totals[series.key].toLocaleString("en-IN")}</strong>
              </li>
            ))}
          </ul>
          <div className="p-hbars" aria-hidden="true">
            {shown.map((row, index) => (
              <div
                key={row.id}
                className={active === index ? "p-hbar-row is-active" : "p-hbar-row"}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="p-hbar-label">{row.name}</span>
                <div className="p-hbar-bars">
                  {SERIES.map((series) => (
                    <span key={series.key} className="p-hbar-line">
                      <span className={`p-hbar series-${series.key}`} style={{ width: `${(row[series.key] / top) * 100}%`, minWidth: row[series.key] ? 3 : 0 }} />
                      <b>{row[series.key]}</b>
                    </span>
                  ))}
                </div>
                {active === index && (
                  <span className="p-tooltip is-row" role="tooltip">
                    <strong>{row.name}</strong>
                    <span>{plural(row.distributors, "distributor")}</span>
                    <span>{plural(row.dealers, "dealer")}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <table className="p-visually-hidden">
        <caption>Active distributors and dealers by state</caption>
        <thead><tr><th>State</th><th>Distributors</th><th>Dealers</th></tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.distributors}</td><td>{row.dealers}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
