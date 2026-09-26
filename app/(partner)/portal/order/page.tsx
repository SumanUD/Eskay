"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../_lib/api";
import { formatDateTime, rupees, STATUS_LABEL } from "../../_lib/format";
import { RoleGate, useApi, useSession } from "../../_lib/session";
import type { Order, OrderStatus } from "../../_lib/types";
import { BackLink, Loading, Notice, StatusBadge } from "../../_lib/ui";

const STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];

export default function OrderPage() {
  return (
    <RoleGate roles={["admin", "distributor", "sales"]}>
      <Suspense fallback={<Loading />}>
        <OrderDetail />
      </Suspense>
    </RoleGate>
  );
}

function OrderDetail() {
  const { user } = useSession();
  const id = Number(useSearchParams().get("id"));
  const valid = Number.isInteger(id) && id > 0;
  const { data, error, loading, reload } = useApi<{ order: Order }>(valid ? `/orders/${id}` : null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeStatus(status: OrderStatus) {
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/orders/${id}`, { method: "PATCH", body: { status } });
      setFeedback({ tone: "success", text: `Order marked as ${STATUS_LABEL[status].toLowerCase()}.` });
      reload();
    } catch (failure) {
      setFeedback({ tone: "error", text: (failure as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!valid) return <Notice tone="error">No order was selected. <Link href="/portal/orders">Back to orders</Link></Notice>;
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice tone="error">{error ?? "This order is not available."} <Link href="/portal/orders">Back to orders</Link></Notice>;
  const { order } = data;

  return (
    <>
      <BackLink href="/portal/orders">Orders</BackLink>
      <header className="p-page-head">
        <div>
          <p className="p-eyebrow">Order #{order.id}</p>
          <h1>{rupees(order.total)}</h1>
          <p className="p-lead">Placed {formatDateTime(order.created_at)}{order.updated_at !== order.created_at ? `, last updated ${formatDateTime(order.updated_at)}` : ""}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      <div className="p-order-grid">
        <section className="p-card">
          <h2 className="p-card-title">Items</h2>
          <div className="p-table-wrap">
            <table className="p-table">
              <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Line total</th></tr></thead>
              <tbody>
                {order.items?.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}<small className="p-sub">{item.product_code}</small></td>
                    <td className="num">{item.quantity.toLocaleString("en-IN")}</td>
                    <td className="num">{rupees(item.unit_price)}</td>
                    <td className="num">{rupees(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total</td><td className="num">{rupees(order.total)}</td></tr></tfoot>
            </table>
          </div>
          {order.notes && <p className="p-notes"><strong>Notes:</strong> {order.notes}</p>}
        </section>

        <aside className="p-card">
          <h2 className="p-card-title">Distributor</h2>
          <p className="p-plain"><strong>{order.distributor}</strong>{order.distributor_organisation && <><br />{order.distributor_organisation}</>}{order.state && <><br />{order.state}</>}</p>

          {user.role === "admin" && (
            <>
              <h2 className="p-card-title">Update status</h2>
              <div className="p-status-actions">
                {STATUSES.filter((status) => status !== order.status).map((status) => (
                  <button key={status} type="button" className={status === "cancelled" ? "p-btn is-danger" : "p-btn is-ghost"} disabled={busy} onClick={() => changeStatus(status)}>
                    Mark {STATUS_LABEL[status].toLowerCase()}
                  </button>
                ))}
              </div>
            </>
          )}
          {user.role === "distributor" && order.status === "placed" && (
            <>
              <h2 className="p-card-title">Changed your mind?</h2>
              <p className="p-plain">You can cancel this order until ESKAY confirms it.</p>
              <button type="button" className="p-btn is-danger" disabled={busy} onClick={() => window.confirm(`Cancel order #${order.id}?`) && changeStatus("cancelled")}>Cancel order</button>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
