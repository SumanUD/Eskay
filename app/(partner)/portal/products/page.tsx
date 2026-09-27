"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Price, ShelfPrices } from "../../_lib/catalogue";
import { RoleGate, useApi, useSession } from "../../_lib/session";
import type { Product } from "../../_lib/types";
import { EmptyState, Loading, Notice, PageHeader, ProductImage } from "../../_lib/ui";

export default function ProductsPage() {
  return (
    <RoleGate roles={["admin", "distributor", "dealer"]}>
      <Products />
    </RoleGate>
  );
}

function Products() {
  const { user } = useSession();
  const { data, error, loading } = useApi<{ products: Product[] }>("/products");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");

  const products = useMemo(() => data?.products ?? [], [data]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const shown = products.filter((product) => {
    const needle = query.trim().toLowerCase();
    const matches = !needle || `${product.name} ${product.code} ${product.brand} ${product.category}`.toLowerCase().includes(needle);
    return matches && (!brand || product.brand === brand);
  });

  return (
    <>
      <PageHeader
        title="Products"
        description={user.role === "admin" ? "How partners see the range, with both distributor and dealer prices." : `The range available in your region, at your ${user.role} price.`}
        actions={user.role === "admin" ? <Link className="p-btn" href="/portal/admin/products">Manage products</Link> : undefined}
      />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <>
          {products.length > 0 && (
            <div className="p-toolbar">
              <input className="p-search" type="search" placeholder="Search by name, code or brand" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
              {brands.length > 1 && (
                <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Filter by brand">
                  <option value="">All brands</option>
                  {brands.map((name) => <option key={name}>{name}</option>)}
                </select>
              )}
              <span className="p-count">{shown.length} of {products.length}</span>
            </div>
          )}
          {!products.length && <EmptyState title="No products yet">{user.role === "admin" ? "Add the first product from Products." : "Products will appear here once ESKAY releases them for your region."}</EmptyState>}
          {products.length > 0 && !shown.length && <EmptyState title="No products match your search" />}
          <div className="p-product-grid">
            {shown.map((product) => (
              <Link className="p-product-card" key={product.id} href={`/portal/product?id=${product.id}`}>
                <ProductImage product={product} />
                <div className="p-product-body">
                  <span className="p-product-meta">{product.brand && <span>{product.brand}</span>}<span className="p-code">{product.code}</span></span>
                  <h3>{product.name}</h3>
                  {product.pack_size && <span className="p-product-pack">{product.pack_size}</span>}
                  <Price product={product} />
                  <ShelfPrices product={product} />
                  {user.role === "admin" && (
                    <span className="p-product-foot">
                      {product.active ? `${product.states.length} state${product.states.length === 1 ? "" : "s"}` : <span className="p-badge is-muted">Inactive</span>}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
