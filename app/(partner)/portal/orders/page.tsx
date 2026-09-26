"use client";

import Link from "next/link";
import { useState } from "react";
import { STATUS_LABEL } from "../../_lib/format";
import { RoleGate, useApi, useSession } from "../../_lib/session";
import type { Order, OrderStatus } from "../../_lib/types";
import { Loading, Notice, OrdersTable, PageHeader } from "../../_lib/ui";

const FILTERS: ("" | OrderStatus)[] = ["", "placed", "confirmed", "dispatched", "delivered", "cancelled"];

export default function OrdersPage() {
  return (
    <RoleGate roles={["admin", "distributor", "sales"]}>
      <Orders />
    </RoleGate>
  );
}

function Orders() {
  const { user } = useSession();
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const { data, error, loading } = useApi<{ orders: Order[] }>(status ? `/orders?status=${status}` : "/orders");
  const heading = { admin: "All orders", distributor: "My orders", sales: "Orders in my area", dealer: "" }[user.role];
  const description = {
    admin: "Every order placed through the portal. Open one to update its status.",
    distributor: "Orders you have placed. You can cancel an order until ESKAY confirms it.",
    sales: "Orders placed by the distributors assigned to you.",
    dealer: "",
  }[user.role];

  return (
    <>
      <PageHeader eyebrow="Orders" title={heading} description={description} actions={user.role === "distributor" ? <Link className="p-btn" href="/portal/orders/new">Place an order</Link> : undefined} />
      <div className="p-pills" role="group" aria-label="Filter by status">
        {FILTERS.map((value) => (
          <button key={value || "all"} type="button" className={status === value ? "active" : undefined} aria-pressed={status === value} onClick={() => setStatus(value)}>
            {value ? STATUS_LABEL[value] : "All"}
          </button>
        ))}
      </div>
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && <OrdersTable orders={data.orders} showDistributor={user.role !== "distributor"} />}
    </>
  );
}
