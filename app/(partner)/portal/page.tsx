"use client";

import Link from "next/link";
import { rupees } from "../_lib/format";
import { useApi, useSession } from "../_lib/session";
import type { Dashboard } from "../_lib/types";
import { Loading, Notice, OrdersTable, PageHeader, Stat } from "../_lib/ui";

export default function DashboardPage() {
  const { user } = useSession();
  const { data, error, loading } = useApi<Dashboard>("/dashboard");
  const first = user.name.split(" ")[0];

  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="error">{error}</Notice>;
  const c = data.counts;

  if (user.role === "admin") {
    return (
      <>
        <PageHeader eyebrow="Administration" title={`Welcome, ${first}`} description="An overview of the partner portal." />
        <div className="p-stats">
          <Stat label="Active products" value={c.active_products} note={`${c.products} in total`} href="/portal/admin/products" />
          <Stat label="Distributors" value={c.distributors} href="/portal/admin/users" />
          <Stat label="Dealers" value={c.dealers} href="/portal/admin/users" />
          <Stat label="Area sales managers" value={c.sales} href="/portal/admin/users" />
          <Stat label="States" value={c.states} href="/portal/admin/states" />
          <Stat label="Open orders" value={c.open_orders} href="/portal/orders" />
        </div>
        <Notice tone={data.region_filter === "on" ? "info" : "warning"}>
          Regional catalogue is <strong>{data.region_filter === "on" ? "on" : "off"}</strong>.{" "}
          {data.region_filter === "on"
            ? "Partners see only products flagged for their state."
            : "Every partner sees every active product; region flags are recorded but not yet applied."}{" "}
          <Link href="/portal/admin/settings">Change in settings</Link>
        </Notice>
        <section className="p-section">
          <h2>Recent orders</h2>
          <OrdersTable orders={data.recent_orders ?? []} showDistributor />
        </section>
      </>
    );
  }

  if (user.role === "sales") {
    return (
      <>
        <PageHeader eyebrow="Area sales" title={`Welcome, ${first}`} description="Orders from the distributors assigned to you." />
        <div className="p-stats">
          <Stat label="My distributors" value={c.distributors} href="/portal/distributors" />
          <Stat label="Open orders" value={c.open_orders} href="/portal/orders" />
          <Stat label="All orders" value={c.orders} href="/portal/orders" />
        </div>
        <section className="p-section">
          <h2>Recent orders in your area</h2>
          <OrdersTable orders={data.recent_orders ?? []} showDistributor />
        </section>
      </>
    );
  }

  if (user.role === "dealer") {
    return (
      <>
        <PageHeader eyebrow="Dealer" title={`Welcome, ${first}`} description={user.distributor ? `Your distributor is ${user.distributor}.` : undefined} />
        <div className="p-stats">
          <Stat label="Products available" value={c.products} href="/portal/catalogue" />
          <Stat label="Current schemes" value={c.schemes} href="/portal/schemes" />
          <Stat label="Downloads" value={c.materials} href="/portal/materials" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Distributor dashboard"
        title={`Welcome, ${first}`}
        actions={<Link className="p-btn" href="/portal/orders/new">Place an order</Link>}
      />
      <div className="p-stats">
        <Stat label="Products available" value={c.products} href="/portal/catalogue" />
        <Stat label="Open orders" value={c.open_orders} href="/portal/orders" />
        <Stat label="Order value" value={rupees(data.order_value ?? 0)} note={`${c.orders} orders, excluding cancelled`} href="/portal/orders" />
        <Stat label="Assigned dealers" value={c.dealers} href="/portal/dealers" />
        <Stat label="Current schemes" value={c.schemes} href="/portal/schemes" />
        <Stat label="Downloads" value={c.materials} href="/portal/materials" />
      </div>
      <section className="p-section">
        <h2>Recent orders</h2>
        <OrdersTable orders={data.recent_orders ?? []} showDistributor={false} />
      </section>
    </>
  );
}
