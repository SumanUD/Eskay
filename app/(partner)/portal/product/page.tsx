"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MaterialList, Price, ShelfPrices } from "../../_lib/catalogue";
import { rupees } from "../../_lib/format";
import { RoleGate, useApi, useSession } from "../../_lib/session";
import type { Material, Product } from "../../_lib/types";
import { BackLink, Loading, Notice, ProductImage } from "../../_lib/ui";

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
  const back = user.role === "admin" ? { href: "/portal/admin/products", label: "Products" } : { href: "/portal/products", label: "Products" };

  if (!valid) return <Notice tone="error">No product was selected. <Link href={back.href}>Back to products</Link></Notice>;
  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="error">{error ?? "This product is not available."} <Link href={back.href}>Back to products</Link></Notice>;
  const { product, materials } = data;

  return (
    <>
      <BackLink href={back.href}>{back.label}</BackLink>
      <article className="p-product-detail">
        <Gallery product={product} />
        <div>
          <p className="p-product-meta">{product.brand && <span>{product.brand}</span>}{product.category && <span>{product.category}</span>}<span className="p-code">{product.code}</span></p>
          <h1>{product.name}</h1>
          {product.pack_size && <p className="p-product-pack">{product.pack_size}</p>}
          <Price product={product} />
          <ShelfPrices product={product} />
          {product.description && <p className="p-description">{product.description}</p>}
          <dl className="p-facts">
            <div><dt>Product code</dt><dd>{product.code}</dd></div>
            {product.brand && <div><dt>Brand</dt><dd>{product.brand}</dd></div>}
            {product.pack_size && <div><dt>Pack size</dt><dd>{product.pack_size}</dd></div>}
            {product.mrp !== null && <div><dt>MRP</dt><dd>{rupees(product.mrp)}</dd></div>}
            {product.retail_price !== null && <div><dt>Retail counter price</dt><dd>{rupees(product.retail_price)}</dd></div>}
            <div><dt>Available in</dt><dd>{product.states.map((s) => s.name).join(", ") || "—"}</dd></div>
            {user.role === "admin" && <div><dt>Status</dt><dd>{product.active ? "Active" : "Inactive — hidden from partners"}</dd></div>}
          </dl>
          {user.role === "admin" && (
            <div className="p-form-actions">
              <Link className="p-btn is-ghost" href="/portal/admin/products">Edit in Products</Link>
            </div>
          )}
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

/** The chosen image large, with every image as a thumbnail to switch to. */
function Gallery({ product }: { product: Product }) {
  const [chosen, setChosen] = useState(product.images[0]);
  return (
    <div className="p-gallery">
      <ProductImage product={product} imageId={chosen} className="is-large" />
      {product.images.length > 1 && (
        <div className="p-thumbs" role="group" aria-label="Product images">
          {product.images.map((imageId, index) => (
            <button key={imageId} type="button" className={imageId === chosen ? "is-active" : undefined} aria-pressed={imageId === chosen} aria-label={`Image ${index + 1} of ${product.images.length}`} onClick={() => setChosen(imageId)}>
              <ProductImage product={product} imageId={imageId} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
