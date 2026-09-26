"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { api } from "../../../_lib/api";
import { rupees } from "../../../_lib/format";
import { RoleGate, useApi } from "../../../_lib/session";
import type { Order, Product } from "../../../_lib/types";
import { EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

export default function NewOrderPage() {
  return (
    <RoleGate roles={["distributor"]}>
      <Suspense fallback={<Loading />}>
        <NewOrder />
      </Suspense>
    </RoleGate>
  );
}

function NewOrder() {
  const router = useRouter();
  const preselected = Number(useSearchParams().get("product"));
  const { data, error, loading } = useApi<{ products: Product[] }>("/products");
  // Quantities are kept as typed text, so a half-typed number is not rewritten under the cursor.
  const [quantities, setQuantities] = useState<Record<number, string>>(() => (preselected > 0 ? { [preselected]: "1" } : {}));
  const [state, setState] = useState({ busy: false, error: "" });

  const products = useMemo(() => data?.products ?? [], [data]);
  const lines = products
    .map((product) => ({ product, quantity: Number(quantities[product.id] ?? 0) }))
    .filter(({ quantity }) => Number.isInteger(quantity) && quantity > 0);
  // Shown as an estimate only; the server recalculates every price when the order is placed.
  const estimate = lines.reduce((sum, { product, quantity }) => sum + (product.price ?? 0) * quantity, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) return setState({ busy: false, error: "Enter a quantity for at least one product." });
    setState({ busy: true, error: "" });
    try {
      const { order } = await api<{ order: Order }>("/orders", {
        method: "POST",
        body: { items: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })), notes: new FormData(event.currentTarget).get("notes") },
      });
      router.replace(`/portal/order?id=${order.id}`);
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  return (
    <>
      <PageHeader title="Place an order" description="Enter quantities for the products you need. Prices are your distributor prices." />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && !products.length && <EmptyState title="No products available to order" />}
      {products.length > 0 && (
        <form className="p-order-form" onSubmit={submit}>
          <div className="p-table-wrap">
            <table className="p-table">
              <thead><tr><th>Product</th><th className="num">Distributor price</th><th className="num">Quantity</th><th className="num">Line total</th></tr></thead>
              <tbody>
                {products.map((product) => {
                  const quantity = Number(quantities[product.id] ?? 0);
                  return (
                    <tr key={product.id} className={quantity > 0 ? "is-selected" : undefined}>
                      <td>{product.name}<small className="p-sub p-meta-row"><span className="p-code">{product.code}</span>{product.pack_size && <span>{product.pack_size}</span>}</small></td>
                      <td className="num">{rupees(product.price ?? 0)}</td>
                      <td className="num">
                        <input
                          className="p-qty"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100000}
                          step={1}
                          value={quantities[product.id] ?? ""}
                          placeholder="0"
                          aria-label={`Quantity of ${product.name}`}
                          onChange={(e) => setQuantities((current) => ({ ...current, [product.id]: e.target.value }))}
                        />
                      </td>
                      <td className="num">{quantity > 0 && Number.isInteger(quantity) ? rupees((product.price ?? 0) * quantity) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-order-summary p-card">
            <Field label="Notes for ESKAY" hint="Delivery instructions or anything else we should know. Optional." wide>
              <textarea name="notes" rows={3} maxLength={1000} />
            </Field>
            <div className="p-summary-total">
              <span>{lines.length} product{lines.length === 1 ? "" : "s"}</span>
              <strong>{rupees(estimate)}</strong>
              <small>Final prices are confirmed by ESKAY when the order is placed.</small>
            </div>
            {state.error && <Notice tone="error">{state.error}</Notice>}
            <button className="p-btn is-block" type="submit" disabled={state.busy || !lines.length}>{state.busy ? "Placing order…" : "Place order"}</button>
          </div>
        </form>
      )}
    </>
  );
}
