"use client";

import { useState } from "react";
import { downloadFile } from "./api";
import { fileSize, rupees } from "./format";
import type { Material, Product } from "./types";
import { Notice } from "./ui";

/** A partner's own price, or both prices for an admin. Partners are never sent the other one. */
export function Price({ product }: { product: Product }) {
  if (product.price !== undefined) {
    return <p className="p-price"><strong>{rupees(product.price)}</strong><span>{product.price_label}</span></p>;
  }
  return (
    <div className="p-price-pair">
      <p className="p-price"><strong>{rupees(product.distributor_price ?? 0)}</strong><span>Distributor price</span></p>
      <p className="p-price"><strong>{rupees(product.dealer_price ?? 0)}</strong><span>Dealer price</span></p>
    </div>
  );
}

export function MaterialList({ materials }: { materials: Material[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function save(material: Material) {
    setBusy(material.id);
    setError("");
    try {
      await downloadFile(`/materials/${material.id}/download`, material.file_name);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="p-files">
        {materials.map((material) => (
          <li key={material.id}>
            <span className="p-file-type" aria-hidden="true">{material.file_name.split(".").pop()?.toUpperCase()}</span>
            <div>
              <strong>{material.title}</strong>
              {material.description && <p>{material.description}</p>}
              <small className="p-meta-row"><span>{material.file_name}</span><span>{fileSize(material.file_size)}</span>{material.product && <span>For {material.product}</span>}</small>
            </div>
            <button className="p-btn is-ghost" type="button" onClick={() => save(material)} disabled={busy === material.id}>
              {busy === material.id ? "Downloading…" : "Download"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
