"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiBlob } from "./api";
import { Icon, type PortalIconName } from "./icons";
import type { Contact, Product } from "./types";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="p-page-head">
      <div>
        <h1>{title}</h1>
        {description && <p className="p-lead">{description}</p>}
      </div>
      {actions && <div className="p-page-actions">{actions}</div>}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="p-back" href={href}><Icon name="back" />{children}</Link>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="p-loading" role="status"><span aria-hidden="true" />{label}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warning"; children: React.ReactNode }) {
  return <div className={`p-notice is-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

// The brand's concentric gold rings, drawn around an open box: "nothing in here yet".
function EmptyArt() {
  return (
    <svg className="p-empty-art" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" className="ring-3" />
      <circle cx="60" cy="60" r="42" className="ring-2" />
      <circle cx="60" cy="60" r="28" className="ring-1" />
      <path className="box" d="m60 44 17 9v18l-17 9-17-9V53l17-9Z" />
      <path className="box" d="m43 53 17 9 17-9M60 62v18" />
      <path className="lid" d="M43 53 34 45l17-8 9 7M77 53l9-8-17-8-9 7" />
    </svg>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="p-empty">
      <EmptyArt />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Stat({ label, value, href, note, icon }: { label: string; value: React.ReactNode; href?: string; note?: string; icon?: PortalIconName }) {
  const body = (
    <>
      <span className="p-stat-label">{icon && <Icon name={icon} />}{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </>
  );
  return href ? <Link className="p-stat is-link" href={href}>{body}</Link> : <div className="p-stat">{body}</div>;
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

/** Loads a private file with the session token and shows it from memory. */
function usePrivateImage(path: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    let url: string | null = null;
    apiBlob(path).then(
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
  }, [path]);
  return path ? src : null;
}

/** A product's cover image, or its initial on the brand's ring pattern when it has none. */
export function ProductImage({ product, imageId, className = "" }: { product: Pick<Product, "id" | "name" | "has_image" | "images" | "updated_at">; imageId?: number; className?: string }) {
  const chosen = imageId ?? product.images[0];
  const src = usePrivateImage(product.has_image && chosen ? `/products/${product.id}/images/${chosen}?v=${encodeURIComponent(product.updated_at)}` : null);
  if (!src) return <div className={`p-product-mark ${className}`} aria-hidden="true"><b>{product.name.charAt(0).toUpperCase()}</b></div>;
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL cannot go through next/image.
  return <img className={`p-product-img ${className}`} src={src} alt={product.name} />;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

/**
 * A person's picture, or their initials. `source` says whose picture it is from the viewer's
 * side: their own, one an admin is managing, or a partner linked to them.
 */
export function Avatar({ name, hasAvatar, source, id, version, className = "" }: { name: string; hasAvatar: boolean; source: "me" | "user" | "contact"; id?: number; version?: string | number; className?: string }) {
  const path = !hasAvatar ? null : source === "me" ? "/me/avatar" : source === "user" ? `/users/${id}/avatar` : `/contacts/${id}/avatar`;
  const src = usePrivateImage(path ? `${path}${version !== undefined ? `?v=${version}` : ""}` : null);
  return (
    <span className={`p-avatar ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL cannot go through next/image. */}
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}

/** Contact details of partners in the viewer's own network. */
export function ContactTable({ contacts, showDealerCount }: { contacts: Contact[]; showDealerCount?: boolean }) {
  return (
    <div className="p-table-wrap">
      <table className="p-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Contact</th>
            <th>State</th>
            {showDealerCount && <th className="num">Dealers</th>}
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id}>
              <td>
                <span className="p-person">
                  <Avatar name={contact.name} hasAvatar={contact.has_avatar} source="contact" id={contact.id} className="is-small" />
                  <span>
                    <strong>{contact.name}</strong>
                    {contact.organisation && <small className="p-sub">{contact.organisation}</small>}
                    {contact.address && <small className="p-sub">{contact.address}</small>}
                  </span>
                </span>
              </td>
              <td>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
                {contact.phone && <small className="p-sub"><a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a></small>}
              </td>
              <td>{contact.state ?? "—"}</td>
              {showDealerCount && <td className="num">{contact.dealer_count ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
