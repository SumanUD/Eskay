"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MaterialList, Price } from "../../_lib/catalogue";
import { RoleGate, useApi, useSession } from "../../_lib/session";
import type { Material, Product } from "../../_lib/types";
import { Loading, Notice, ProductImage } from "../../_lib/ui";

export default function ProductPage() {
  return (
    <RoleGate roles={["admin", "distributor", "dealer"]}>
      <Suspense fallback={<Loading />}>
        <ProductDetail />
      </Suspense>
    </RoleGate>
  );
}

function ProductDetail() {
  const { user } = useSession();
  const id = Number(useSearchParams().get("id"));
  const valid = Number.isInteger(id) && id > 0;
  const { data, error, loading } = useApi<{ product: Product; materials: Material[] }>(valid ? `/products/${id}` : null);

  if (!valid) return <Notice tone="error">No product was selected. <Link href="/portal/catalogue">Back to the catalogue</Link></Notice>;
  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="error">{error ?? "This product is not available."} <Link href="/portal/catalogue">Back to the catalogue</Link></Notice>;
  const { product, materials } = data;

  return (
    <>
      <Link className="p-back" href="/portal/catalogue">← Catalogue</Link>
      <article className="p-product-detail">
        <ProductImage product={product} className="is-large" />
        <div>
          <p className="p-eyebrow">{[product.category, product.code].filter(Boolean).join(" · ")}</p>
          <h1>{product.name}</h1>
          {product.pack_size && <p className="p-product-pack">{product.pack_size}</p>}
          <Price product={product} />
          {product.description && <p className="p-description">{product.description}</p>}
          <dl className="p-facts">
            <div><dt>Product code</dt><dd>{product.code}</dd></div>
            {product.category && <div><dt>Category</dt><dd>{product.category}</dd></div>}
            <div><dt>Available in</dt><dd>{product.states.map((s) => s.name).join(", ") || "—"}</dd></div>
            {user.role === "admin" && <div><dt>Status</dt><dd>{product.active ? "Active" : "Inactive — hidden from partners"}</dd></div>}
          </dl>
          <div className="p-form-actions">
            {user.role === "distributor" && <Link className="p-btn" href={`/portal/orders/new?product=${product.id}`}>Order this product</Link>}
            {user.role === "admin" && <Link className="p-btn is-ghost" href="/portal/admin/products">Edit in Products</Link>}
          </div>
        </div>
      </article>
      {materials.length > 0 && (
        <section className="p-section">
          <h2>Downloads for this product</h2>
          <MaterialList materials={materials} />
        </section>
      )}
    </>
  );
}
