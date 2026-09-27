"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MaterialList } from "../_lib/catalogue";
import { NetworkChart } from "../_lib/charts";
import { formatDate, ROLE_LABEL } from "../_lib/format";
import { Icon } from "../_lib/icons";
import { useApi, useSession } from "../_lib/session";
import type { Contact, Dashboard, User } from "../_lib/types";
import { Avatar, ContactTable, EmptyState, Loading, Notice, Stat } from "../_lib/ui";

const count = (n: number, word: string) => `${n === 0 ? "no" : n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// A one-line reading of the numbers below it, in the person's own terms.
function summary(user: User, data: Dashboard) {
  const c = data.counts;
  switch (user.role) {
    case "admin":
      return `The network has ${count(c.distributors, "distributor")} and ${count(c.dealers, "dealer")} across ${count(c.states, "state")}, with ${count(c.active_products, "active product")}.`;
    case "sales":
      return `${capital(count(c.distributors, "distributor"))} ${c.distributors === 1 ? "is" : "are"} assigned to you, supplying ${count(c.dealers, "dealer")}.`;
    case "distributor":
      return `You have ${count(c.dealers, "assigned dealer")}, ${count(c.products, "product")} and ${count(c.schemes, "scheme")} available to you.`;
    default:
      return `${capital(count(c.products, "product"))} and ${count(c.schemes, "scheme")} are available to you right now.`;
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
    admin: <><Link className="p-btn" href="/portal/admin/users"><Icon name="plus" />Add a partner</Link><Link className="p-btn is-light" href="/portal/admin/products">Manage products</Link></>,
    distributor: <><Link className="p-btn" href="/portal/products">View products</Link><Link className="p-btn is-light" href="/portal/dealers"><Icon name="people" />My dealers</Link></>,
    dealer: <><Link className="p-btn" href="/portal/products">View products</Link><Link className="p-btn is-light" href="/portal/materials"><Icon name="download" />Downloads</Link></>,
    sales: <Link className="p-btn" href="/portal/distributors">My distributors</Link>,
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
            <Stat icon="truck" label="Distributors" value={n(c.distributors)} href="/portal/admin/users?role=distributor" />
            <Stat icon="people" label="Dealers" value={n(c.dealers)} href="/portal/admin/users?role=dealer" />
            <Stat icon="user" label="Sales managers" value={n(c.sales)} href="/portal/admin/users?role=sales" />
            <Stat icon="box" label="Active products" value={n(c.active_products)} note={`${c.products} in total`} href="/portal/admin/products" />
            <Stat icon="tag" label="Schemes running" value={n(c.schemes)} href="/portal/admin/schemes" />
            <Stat icon="download" label="Materials" value={n(c.materials)} href="/portal/admin/materials" />
          </>
        )}
        {user.role === "distributor" && (
          <>
            <Stat icon="people" label="Assigned dealers" value={n(c.dealers)} href="/portal/dealers" />
            <Stat icon="box" label="Products available" value={n(c.products)} href="/portal/products" />
            <Stat icon="tag" label="Schemes running" value={n(c.schemes)} href="/portal/schemes" />
            <Stat icon="download" label="Downloads" value={n(c.materials)} href="/portal/materials" />
          </>
        )}
        {user.role === "sales" && (
          <>
            <Stat icon="truck" label="My distributors" value={n(c.distributors)} href="/portal/distributors" />
            <Stat icon="people" label="Their dealers" value={n(c.dealers)} href="/portal/distributors" />
          </>
        )}
        {user.role === "dealer" && (
          <>
            <Stat icon="box" label="Products available" value={n(c.products)} href="/portal/products" />
            <Stat icon="tag" label="Schemes running" value={n(c.schemes)} href="/portal/schemes" />
            <Stat icon="download" label="Downloads" value={n(c.materials)} href="/portal/materials" />
          </>
        )}
      </div>

      {user.role === "admin" && c.awaiting_first_sign_in > 0 && (
        <Notice tone="warning">
          {capital(count(c.awaiting_first_sign_in, "partner account"))} {c.awaiting_first_sign_in === 1 ? "has" : "have"} not signed in for the first time yet. <Link href="/portal/admin/users">Review accounts</Link>
        </Notice>
      )}

      {user.role === "admin" && (
        <div className={`p-region-note ${data.region_filter === "on" ? "is-on" : ""}`}>
          <Icon name="pin" />
          <p>
            <strong>Regional products are {data.region_filter === "on" ? "on" : "off"}.</strong>{" "}
            {data.region_filter === "on" ? "Partners see only products flagged for their state." : "Region flags are recorded, but every partner currently sees every active product."}
          </p>
          <Link href="/portal/admin/settings">Settings</Link>
        </div>
      )}

      {user.role === "admin" && (
        <div className="p-dash-charts">
          <NetworkChart rows={data.network ?? []} />
          <section className="p-card p-recent">
            <div className="p-section-head">
              <h2>Newest partners</h2>
              <Link href="/portal/admin/users">All partners</Link>
            </div>
            {data.recent_partners?.length ? (
              <ul className="p-people">
                {data.recent_partners.map((partner) => (
                  <li key={partner.id}>
                    <Avatar name={partner.name} hasAvatar={partner.has_avatar} source="user" id={partner.id} className="is-small" />
                    <span>
                      <strong>{partner.name}</strong>
                      <small>{ROLE_LABEL[partner.role]}{partner.state && ` · ${partner.state}`}{partner.role === "dealer" && partner.distributor && ` · under ${partner.distributor}`}</small>
                    </span>
                    <span className="p-people-date">
                      <small>Added {formatDate(partner.created_at)}</small>
                      {!partner.last_login_at && <span className="p-badge is-muted">Not signed in yet</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-chart-empty">No partners yet. Add distributors first, then the dealers under them.</p>
            )}
          </section>
        </div>
      )}

      {user.role === "dealer" && <DistributorCard distributor={data.distributor ?? null} />}

      {user.role === "distributor" && (
        <section className="p-section">
          <div className="p-section-head">
            <h2>Your dealers</h2>
            {(c.dealers ?? 0) > 0 && <Link href="/portal/dealers">All {c.dealers} dealers</Link>}
          </div>
          {data.dealers?.length ? <ContactTable contacts={data.dealers} /> : <EmptyState title="No dealers assigned yet">When ESKAY assigns dealers to you, they will appear here.</EmptyState>}
        </section>
      )}

      {user.role === "sales" && (
        <section className="p-section">
          <div className="p-section-head">
            <h2>Your distributors</h2>
            {(c.distributors ?? 0) > 0 && <Link href="/portal/distributors">View all</Link>}
          </div>
          {data.distributors?.length ? <ContactTable contacts={data.distributors} showDealerCount /> : <EmptyState title="No distributors assigned yet">When ESKAY assigns distributors to you, they will appear here.</EmptyState>}
        </section>
      )}

      {(user.role === "distributor" || user.role === "dealer") && (
        <section className="p-section">
          <div className="p-section-head">
            <h2>Latest downloads</h2>
            {(c.materials ?? 0) > 0 && <Link href="/portal/materials">All downloads</Link>}
          </div>
          {data.recent_materials?.length ? <MaterialList materials={data.recent_materials} /> : <p className="p-muted">Material ESKAY shares with you will appear here.</p>}
        </section>
      )}
    </div>
  );
}

// A dealer's one contact at the next level up: who supplies them.
function DistributorCard({ distributor }: { distributor: Contact | null }) {
  if (!distributor) return <Notice tone="info">You have not been assigned to a distributor yet. Please contact ESKAY.</Notice>;
  return (
    <section className="p-card p-contact-card">
      <Avatar name={distributor.name} hasAvatar={distributor.has_avatar} source="contact" id={distributor.id} className="is-large" />
      <div>
        <p className="p-eyebrow">Your distributor</p>
        <h2>{distributor.name}</h2>
        {distributor.organisation && <p>{distributor.organisation}</p>}
        <p className="p-meta-row">
          <a href={`mailto:${distributor.email}`}><Icon name="mail" />{distributor.email}</a>
          {distributor.phone && <a href={`tel:${distributor.phone.replace(/[^\d+]/g, "")}`}>{distributor.phone}</a>}
          {distributor.state && <span><Icon name="pin" />{distributor.state}</span>}
        </p>
      </div>
    </section>
  );
}
