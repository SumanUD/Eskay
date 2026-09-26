"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiBlob } from "./api";
import { formatDate, rupees, STATUS_LABEL } from "./format";
import type { Contact, Order, OrderStatus, Product } from "./types";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="p-page-head">
      <div>
        {eyebrow && <p className="p-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="p-lead">{description}</p>}
      </div>
      {actions && <div className="p-page-actions">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="p-loading" role="status"><span aria-hidden="true" />{label}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warning"; children: React.ReactNode }) {
  return <div className={`p-notice is-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="p-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Stat({ label, value, href, note }: { label: string; value: React.ReactNode; href?: string; note?: string }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </>
  );
  return href ? <Link className="p-stat is-link" href={href}>{body}</Link> : <div className="p-stat">{body}</div>;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`p-badge status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Field({ label, hint, required, children, wide }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "p-field is-wide" : "p-field"}>
      <span>{label}{required && <b aria-hidden="true">*</b>}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/**
 * A modal built on the native <dialog>, which supplies focus trapping, Escape to close and the
 * backdrop. Its content is only mounted while open, so every opening starts from a fresh form.
 */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={wide ? "p-dialog is-wide" : "p-dialog"} onClose={onClose} aria-labelledby="p-dialog-title">
      <div className="p-dialog-head">
        <h2 id="p-dialog-title">{title}</h2>
        <button type="button" className="p-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="p-dialog-body">{open && children}</div>
    </dialog>
  );
}

/** Product images are private, so they are fetched with the session token and shown from memory. */
export function ProductImage({ product, className = "" }: { product: Pick<Product, "id" | "name" | "has_image" | "updated_at">; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!product.has_image) return;
    let live = true;
    let url: string | null = null;
    apiBlob(`/products/${product.id}/image`).then(
      (blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      () => undefined,
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [product.id, product.has_image, product.updated_at]);

  if (!product.has_image || !src) {
    return <div className={`p-product-mark ${className}`} aria-hidden="true"><b>{product.name.charAt(0).toUpperCase()}</b></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL cannot go through next/image.
  return <img className={`p-product-img ${className}`} src={src} alt={product.name} />;
}

/** Contact details of partners in the viewer's own network. */
export function ContactTable({ contacts, orders }: { contacts: Contact[]; orders?: boolean }) {
  return (
    <div className="p-table-wrap">
      <table className="p-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Contact</th>
            <th>State</th>
            {orders && <th className="num">Open orders</th>}
            {orders && <th className="num">All orders</th>}
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id}>
              <td>
                <strong>{contact.name}</strong>
                {contact.organisation && <small className="p-sub">{contact.organisation}</small>}
                {contact.address && <small className="p-sub">{contact.address}</small>}
              </td>
              <td>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
                {contact.phone && <small className="p-sub"><a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a></small>}
              </td>
              <td>{contact.state ?? "—"}</td>
              {orders && <td className="num">{contact.open_orders}</td>}
              {orders && <td className="num">{contact.orders}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersTable({ orders, showDistributor }: { orders: Order[]; showDistributor: boolean }) {
  if (!orders.length) return <EmptyState title="No orders yet" />;
  return (
    <div className="p-table-wrap">
      <table className="p-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Date</th>
            {showDistributor && <th>Distributor</th>}
            <th className="num">Items</th>
            <th className="num">Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td><Link className="p-row-link" href={`/portal/order?id=${order.id}`}>#{order.id}</Link></td>
              <td>{formatDate(order.created_at)}</td>
              {showDistributor && (
                <td>
                  {order.distributor}
                  {order.distributor_organisation && <small className="p-sub">{order.distributor_organisation}</small>}
                </td>
              )}
              <td className="num">{order.item_count}</td>
              <td className="num">{rupees(order.total)}</td>
              <td><StatusBadge status={order.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
