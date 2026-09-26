"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusMix, TrendChart } from "../_lib/charts";
import { ROLE_LABEL, rupees } from "../_lib/format";
import { Icon } from "../_lib/icons";
import { useApi, useSession } from "../_lib/session";
import type { Dashboard, User } from "../_lib/types";
import { Loading, Notice, OrdersTable, Stat } from "../_lib/ui";

const count = (n: number, word: string) => `${n === 0 ? "no" : n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

// A one-line reading of the numbers below it, in the person's own terms.
function summary(user: User, data: Dashboard) {
  const c = data.counts;
  switch (user.role) {
    case "admin":
      return `There ${c.open_orders === 1 ? "is" : "are"} ${count(c.open_orders, "open order")} across ${count(c.distributors, "distributor")} and ${count(c.dealers, "dealer")}.`;
    case "sales":
      return `There ${c.open_orders === 1 ? "is" : "are"} ${count(c.open_orders, "open order")} from the ${count(c.distributors, "distributor")} in your area.`;
    case "distributor":
      return `You have ${count(c.open_orders, "order")} in progress and ${count(c.schemes, "scheme")} running for you.`;
    default:
      return `${count(c.products, "product").replace(/^no/, "No")} and ${count(c.schemes, "scheme")} are available to you right now.`;
  }
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const today = () => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

/** Counts up to `value` once, as part of the dashboard's single entrance. Skipped for reduced motion. */
function CountUp({ value, format = (n) => n.toLocaleString("en-IN") }: { value: number; format?: (n: number) => string }) {
  // Starts from zero only when it is going to animate, so the final number never flashes first.
  const [shown, setShown] = useState(() => (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : value));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) return setShown(value);
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const t = Math.min((time - start) / 900, 1);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}

// The brand's concentric gold rings, as on the public site's feature panels.
function Rings() {
  return (
    <svg className="p-welcome-rings" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="198" />
      <circle cx="200" cy="200" r="160" />
      <circle cx="200" cy="200" r="122" />
      <circle cx="200" cy="200" r="84" />
    </svg>
  );
}

export default function DashboardPage() {
  const { user } = useSession();
  const { data, error, loading } = useApi<Dashboard>("/dashboard");

  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="error">{error}</Notice>;
  const c = data.counts;
  const n = (value: number) => <CountUp value={value} />;

  const actions = {
    admin: <><Link className="p-btn" href="/portal/orders">Review orders</Link><Link className="p-btn is-light" href="/portal/admin/products"><Icon name="plus" />Add a product</Link></>,
    distributor: <><Link className="p-btn" href="/portal/orders/new"><Icon name="cart" />Place an order</Link><Link className="p-btn is-light" href="/portal/catalogue">Browse the catalogue</Link></>,
    dealer: <><Link className="p-btn" href="/portal/catalogue">Browse the catalogue</Link><Link className="p-btn is-light" href="/portal/materials"><Icon name="download" />Downloads</Link></>,
    sales: <Link className="p-btn" href="/portal/orders">View area orders</Link>,
  }[user.role];

  return (
    <div className="p-dash">
      <section className="p-welcome">
        <Rings />
        <div className="p-welcome-body">
          <p className="p-welcome-date">{today()}</p>
          <h1>{greeting()}, {user.name}</h1>
          <p className="p-welcome-summary">{summary(user, data)}</p>
          <div className="p-welcome-actions">{actions}</div>
        </div>
        <div className="p-welcome-role">
          <span>{ROLE_LABEL[user.role]}</span>
          {user.state && <small>{user.state}</small>}
          {user.role === "dealer" && user.distributor && <small>Supplied by {user.distributor}</small>}
        </div>
      </section>

      <div className="p-stats">
        {user.role === "admin" && (
          <>
            <Stat icon="orders" label="Open orders" value={n(c.open_orders)} href="/portal/orders" />
            <Stat icon="box" label="Active products" value={n(c.active_products)} note={`${c.products} in the catalogue`} href="/portal/admin/products" />
            <Stat icon="truck" label="Distributors" value={n(c.distributors)} href="/portal/admin/users" />
            <Stat icon="people" label="Dealers" value={n(c.dealers)} href="/portal/admin/users" />
            <Stat icon="user" label="Sales managers" value={n(c.sales)} href="/portal/admin/users" />
            <Stat icon="pin" label="States" value={n(c.states)} href="/portal/admin/states" />
          </>
        )}
        {user.role === "distributor" && (
          <>
            <Stat icon="orders" label="Orders in progress" value={n(c.open_orders)} href="/portal/orders" />
            <Stat icon="rupee" label="Order value" value={<CountUp value={data.order_value ?? 0} format={rupees} />} note={`From ${c.orders} orders, excluding cancelled`} href="/portal/orders" />
            <Stat icon="catalogue" label="Products available" value={n(c.products)} href="/portal/catalogue" />
            <Stat icon="people" label="Assigned dealers" value={n(c.dealers)} href="/portal/dealers" />
            <Stat icon="tag" label="Schemes running" value={n(c.schemes)} href="/portal/schemes" />
            <Stat icon="download" label="Downloads" value={n(c.materials)} href="/portal/materials" />
          </>
        )}
        {user.role === "sales" && (
          <>
            <Stat icon="orders" label="Open orders" value={n(c.open_orders)} href="/portal/orders" />
            <Stat icon="truck" label="My distributors" value={n(c.distributors)} href="/portal/distributors" />
            <Stat icon="dashboard" label="All orders" value={n(c.orders)} href="/portal/orders" />
          </>
        )}
        {user.role === "dealer" && (
          <>
            <Stat icon="catalogue" label="Products available" value={n(c.products)} href="/portal/catalogue" />
            <Stat icon="tag" label="Schemes running" value={n(c.schemes)} href="/portal/schemes" />
            <Stat icon="download" label="Downloads" value={n(c.materials)} href="/portal/materials" />
          </>
        )}
      </div>

      {user.role === "admin" && (
        <div className={`p-region-note ${data.region_filter === "on" ? "is-on" : ""}`}>
          <Icon name="pin" />
          <p>
            <strong>Regional catalogue is {data.region_filter === "on" ? "on" : "off"}.</strong>{" "}
            {data.region_filter === "on" ? "Partners see only products flagged for their state." : "Region flags are recorded, but every partner currently sees every active product."}
          </p>
          <Link href="/portal/admin/settings">Settings</Link>
        </div>
      )}

      {data.insights && (
        <div className="p-dash-charts">
          <TrendChart months={data.insights.monthly} />
          <StatusMix status={data.insights.status} />
        </div>
      )}

      {data.recent_orders && (
        <section className="p-section">
          <div className="p-section-head">
            <h2>Recent orders</h2>
            <Link href="/portal/orders">All orders</Link>
          </div>
          <OrdersTable orders={data.recent_orders} showDistributor={user.role !== "distributor"} />
        </section>
      )}
    </div>
  );
}
