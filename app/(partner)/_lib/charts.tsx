"use client";

import { useState } from "react";
import { rupees, STATUS_LABEL } from "./format";
import type { MonthTotal, OrderStatus } from "./types";

const monthName = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const compactRupees = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);
const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

// Rounds the axis up to a clean 1, 2 or 5 step so the ticks read as round rupee amounts.
function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Order value per month: one series, so no legend; the title says what is plotted. */
export function TrendChart({ months }: { months: MonthTotal[] }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceCeiling(Math.max(...months.map((m) => m.value)) / 100) * 100;
  const hasData = months.some((m) => m.value > 0);
  const latest = months[months.length - 1];

  return (
    <figure className="p-chart">
      <figcaption className="p-chart-head">
        <h2>Order value</h2>
        <p>Last six months, excluding cancelled orders</p>
      </figcaption>
      {!hasData ? (
        <p className="p-chart-empty">No order value in the last six months yet. It builds up here as orders are placed.</p>
      ) : (
        <div className="p-columns">
          {/* Ticks and gridlines sit on the bar area only, which starts above the month-label band. */}
          <div className="p-columns-axis" aria-hidden="true">
            {[1, 0.5, 0].map((share) => (
              <span key={share} style={{ bottom: `calc(var(--band) + ${share} * var(--plot-h))` }}>₹{compactRupees.format((top * share) / 100)}</span>
            ))}
          </div>
          <div className="p-columns-plot">
            {[1, 0.5, 0].map((share) => <i key={share} className="p-gridline" style={{ bottom: `calc(var(--band) + ${share} * var(--plot-h))` }} aria-hidden="true" />)}
            {months.map((month, index) => {
              const height = (month.value / top) * 100;
              const isLatest = index === months.length - 1;
              return (
                <div
                  key={month.month}
                  className={active === index ? "p-column is-active" : "p-column"}
                  tabIndex={0}
                  aria-label={`${monthLong.format(asDate(month.month))}: ${rupees(month.value)} from ${plural(month.orders, "order")}`}
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                >
                  <div className="p-column-track">
                    {isLatest && month.value > 0 && active !== index && <span className="p-column-cap" style={{ bottom: `${height}%` }}>{rupees(month.value)}</span>}
                    <span className="p-column-bar" style={{ height: `${Math.max(height, month.value > 0 ? 1.5 : 0)}%` }} />
                    {/* Opens just above the bar it describes, so it never covers the chart's title. */}
                    {active === index && (
                      <span className="p-tooltip" role="tooltip" style={{ bottom: `calc(${height}% + 10px)` }}>
                        <strong>{monthLong.format(asDate(month.month))}</strong>
                        <span>{rupees(month.value)}</span>
                        <span>{plural(month.orders, "order")}</span>
                      </span>
                    )}
                  </div>
                  <span className="p-column-label">{monthName.format(asDate(month.month))}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <table className="p-visually-hidden">
        <caption>Order value by month, excluding cancelled orders</caption>
        <thead><tr><th>Month</th><th>Orders</th><th>Value</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><td>{monthLong.format(asDate(m.month))}</td><td>{m.orders}</td><td>{rupees(m.value)}</td></tr>)}</tbody>
      </table>
      {hasData && latest && (
        <p className="p-chart-foot">{latest.orders ? `This month so far: ${rupees(latest.value)} from ${plural(latest.orders, "order")}.` : "Nothing ordered yet this month."}</p>
      )}
    </figure>
  );
}

const STATUS_ORDER: OrderStatus[] = ["placed", "confirmed", "dispatched", "delivered", "cancelled"];

/**
 * Where orders stand: part-to-whole in one stacked bar. The four live steps share one gold-to-bronze
 * ramp in workflow order, and cancelled sits apart in neutral grey. The legend doubles as the table.
 */
export function StatusMix({ status }: { status: Record<OrderStatus, number> }) {
  const [active, setActive] = useState<OrderStatus | null>(null);
  const total = STATUS_ORDER.reduce((sum, key) => sum + status[key], 0);
  const share = (key: OrderStatus) => (total ? Math.round((status[key] / total) * 100) : 0);

  return (
    <figure className="p-chart">
      <figcaption className="p-chart-head">
        <h2>Where orders stand</h2>
        <p>{total ? plural(total, "order") : "No orders yet"}, by current status</p>
      </figcaption>
      {!total ? (
        <p className="p-chart-empty">Once orders are placed, you will see here how many are placed, confirmed, dispatched and delivered.</p>
      ) : (
        <div className="p-stack" role="img" aria-label={STATUS_ORDER.map((key) => `${STATUS_LABEL[key]} ${status[key]}`).join(", ")}>
          {STATUS_ORDER.filter((key) => status[key] > 0).map((key) => (
            <span
              key={key}
              className={`p-stack-part status-${key}${active === key ? " is-active" : ""}`}
              style={{ flexGrow: status[key] }}
              onMouseEnter={() => setActive(key)}
              onMouseLeave={() => setActive(null)}
            >
              {active === key && (
                <span className="p-tooltip" role="tooltip">
                  <strong>{STATUS_LABEL[key]}</strong>
                  <span>{plural(status[key], "order")}</span>
                  <span>{share(key)}% of all orders</span>
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <ul className="p-legend">
        {STATUS_ORDER.map((key) => (
          <li key={key} className={active === key ? "is-active" : undefined} onMouseEnter={() => setActive(key)} onMouseLeave={() => setActive(null)}>
            <i className={`p-legend-dot status-${key}`} aria-hidden="true" />
            <span>{STATUS_LABEL[key]}</span>
            <strong>{status[key].toLocaleString("en-IN")}</strong>
            <small>{share(key)}%</small>
          </li>
        ))}
      </ul>
    </figure>
  );
}
