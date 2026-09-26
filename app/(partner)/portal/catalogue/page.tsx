"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Price } from "../../_lib/catalogue";
import { RoleGate, useApi, useSession } from "../../_lib/session";
import type { Product } from "../../_lib/types";
import { EmptyState, Loading, Notice, PageHeader, ProductImage } from "../../_lib/ui";

export default function CataloguePage() {
  return (
    <RoleGate roles={["admin", "distributor", "dealer"]}>
      <Catalogue />
    </RoleGate>
  );
}

function Catalogue() {
  const { user } = useSession();
  const { data, error, loading } = useApi<{ products: Product[] }>("/products");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const products = useMemo(() => data?.products ?? [], [data]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const shown = products.filter((product) => {
    const needle = query.trim().toLowerCase();
    const matches = !needle || `${product.name} ${product.code} ${product.category}`.toLowerCase().includes(needle);
    return matches && (!category || product.category === category);
  });

  return (
    <>
      <PageHeader
        title="Products"
        description={user.role === "admin" ? "Every product, with both distributor and dealer prices." : `Prices shown are your ${user.role} prices.`}
        actions={user.role === "distributor" ? <Link className="p-btn" href="/portal/orders/new">Place an order</Link> : user.role === "admin" ? <Link className="p-btn" href="/portal/admin/products">Manage products</Link> : undefined}
      />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <>
          <div className="p-toolbar">
            <input className="p-search" type="search" placeholder="Search by name, code or category" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
            {categories.length > 1 && (
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
                <option value="">All categories</option>
                {categories.map((name) => <option key={name}>{name}</option>)}
              </select>
            )}
            <span className="p-count">{shown.length} of {products.length}</span>
          </div>
          {!products.length && <EmptyState title="No products yet">{user.role === "admin" ? "Add the first product from Products." : "Products will appear here once ESKAY releases them for your region."}</EmptyState>}
          {products.length > 0 && !shown.length && <EmptyState title="No products match your search" />}
          <div className="p-product-grid">
            {shown.map((product) => (
              <Link className="p-product-card" key={product.id} href={`/portal/product?id=${product.id}`}>
                <ProductImage product={product} />
                <div className="p-product-body">
                  <span className="p-product-meta">{product.category && <span>{product.category}</span>}<span className="p-code">{product.code}</span></span>
                  <h3>{product.name}</h3>
                  {product.pack_size && <span className="p-product-pack">{product.pack_size}</span>}
                  <Price product={product} />
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
