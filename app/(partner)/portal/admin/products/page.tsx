"use client";

import { FormEvent, useState } from "react";
import { api, uploadFile } from "../../../_lib/api";
import { rupees, toPaise, toRupeeInput } from "../../../_lib/format";
import { RoleGate, useApi } from "../../../_lib/session";
import type { Product, State } from "../../../_lib/types";
import { Dialog, EmptyState, Field, Loading, Notice, PageHeader, ProductImage } from "../../../_lib/ui";

export default function AdminProductsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminProducts />
    </RoleGate>
  );
}

function AdminProducts() {
  const products = useApi<{ products: Product[] }>("/products");
  const states = useApi<{ states: State[] }>("/states");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function remove(product: Product) {
    if (!window.confirm(`Delete ${product.name}? Past orders keep their record of it. To hide it instead, edit it and untick Active.`)) return;
    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      setMessage({ tone: "success", text: `${product.name} was deleted.` });
      products.reload();
    } catch (failure) {
      setMessage({ tone: "error", text: (failure as Error).message });
    }
  }

  const activeStates = (states.data?.states ?? []).filter((state) => state.active);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Products"
        description="Every product needs a distributor price, a dealer price and at least one state it is released in."
        actions={<button className="p-btn" type="button" onClick={() => setEditing("new")} disabled={!activeStates.length}>Add product</button>}
      />
      {states.data && !activeStates.length && <Notice tone="warning">Add a state first — every product must be flagged for at least one state.</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {products.loading && <Loading />}
      {products.error && <Notice tone="error">{products.error}</Notice>}
      {products.data && !products.data.products.length && <EmptyState title="No products yet">Add the first product to start the catalogue.</EmptyState>}
      {products.data && products.data.products.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead>
              <tr><th aria-label="Image" /><th>Product</th><th>Category</th><th className="num">Distributor</th><th className="num">Dealer</th><th>Region</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {products.data.products.map((product) => (
                <tr key={product.id}>
                  <td><ProductImage product={product} className="is-thumb" /></td>
                  <td><strong>{product.name}</strong><small className="p-sub">{product.code}{product.pack_size ? ` · ${product.pack_size}` : ""}</small></td>
                  <td>{product.category || "—"}</td>
                  <td className="num">{rupees(product.distributor_price ?? 0)}</td>
                  <td className="num">{rupees(product.dealer_price ?? 0)}</td>
                  <td><span title={product.states.map((s) => s.name).join(", ")}>{product.states.length === activeStates.length && activeStates.length > 1 ? "All states" : product.states.map((s) => s.name).join(", ")}</span></td>
                  <td>{product.active ? <span className="p-badge is-ok">Active</span> : <span className="p-badge is-muted">Inactive</span>}</td>
                  <td className="p-row-actions">
                    <button type="button" className="p-link-btn" onClick={() => setEditing(product)}>Edit</button>
                    <button type="button" className="p-link-btn is-danger" onClick={() => remove(product)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add product" : "Edit product"} wide>
        {editing !== null && (
          <ProductForm
            product={editing === "new" ? null : editing}
            states={activeStates}
            onSaved={(saved, created) => {
              setEditing(null);
              setMessage({ tone: "success", text: `${saved.name} was ${created ? "added" : "saved"}.` });
              products.reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function ProductForm({ product, states, onSaved }: { product: Product | null; states: State[]; onSaved: (product: Product, created: boolean) => void }) {
  const [stateIds, setStateIds] = useState<number[]>(() => product?.states.map((s) => s.id) ?? []);
  const [image, setImage] = useState<{ id: number | null; name: string } | null>(null);
  const [state, setState] = useState({ busy: false, error: "" });
  // A product may be flagged for a state that has since been deactivated; keep it listed so the
  // flag can be seen and removed rather than silently kept.
  const choices = [...states, ...(product?.states ?? []).filter((s) => !states.some((active) => active.id === s.id)).map((s) => ({ ...s, code: null, active: false }))];

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setState({ busy: true, error: "" });
    try {
      const uploaded = await uploadFile(file);
      setImage({ id: uploaded.id, name: uploaded.original_name });
      setState({ busy: false, error: "" });
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const distributorPrice = toPaise(String(data.get("distributor_price")));
    const dealerPrice = toPaise(String(data.get("dealer_price")));
    if (distributorPrice === null || dealerPrice === null) return setState({ busy: false, error: "Enter prices in rupees, for example 1250 or 1250.50." });
    if (!stateIds.length) return setState({ busy: false, error: "Choose at least one state for this product." });
    const body: Record<string, unknown> = {
      name: data.get("name"), code: data.get("code"), category: data.get("category"), pack_size: data.get("pack_size"),
      description: data.get("description"), distributor_price: distributorPrice, dealer_price: dealerPrice,
      state_ids: stateIds, active: data.get("active") === "on",
    };
    if (image) body.image_file_id = image.id;
    setState({ busy: true, error: "" });
    try {
      const { product: saved } = product
        ? await api<{ product: Product }>(`/products/${product.id}`, { method: "PATCH", body })
        : await api<{ product: Product }>("/products", { method: "POST", body });
      onSaved(saved, !product);
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  const toggle = (id: number) => setStateIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const hasImage = image ? image.id !== null : Boolean(product?.has_image);

  return (
    <form className="p-form p-grid-form" onSubmit={submit}>
      <Field label="Product name" required><input name="name" defaultValue={product?.name} minLength={2} maxLength={120} required /></Field>
      <Field label="Product code" hint="Unique; stored in capitals." required><input name="code" defaultValue={product?.code} maxLength={40} required /></Field>
      <Field label="Category"><input name="category" defaultValue={product?.category} maxLength={60} placeholder="e.g. Signature Collection" /></Field>
      <Field label="Pack size"><input name="pack_size" defaultValue={product?.pack_size} maxLength={60} placeholder="e.g. Carton of 50" /></Field>
      <Field label="Distributor price (₹)" required><input name="distributor_price" inputMode="decimal" defaultValue={product?.distributor_price !== undefined ? toRupeeInput(product.distributor_price) : ""} required /></Field>
      <Field label="Dealer price (₹)" required><input name="dealer_price" inputMode="decimal" defaultValue={product?.dealer_price !== undefined ? toRupeeInput(product.dealer_price) : ""} required /></Field>
      <Field label="Description" wide><textarea name="description" rows={4} defaultValue={product?.description} maxLength={5000} /></Field>

      <fieldset className="p-fieldset is-wide">
        <legend>Region flag<b aria-hidden="true">*</b></legend>
        <p className="p-hint">The states this product is released in. When the regional catalogue is switched on, partners only see products flagged for their state.</p>
        <div className="p-check-actions">
          <button type="button" className="p-link-btn" onClick={() => setStateIds(states.map((s) => s.id))}>Select all</button>
          <button type="button" className="p-link-btn" onClick={() => setStateIds([])}>Clear</button>
        </div>
        <div className="p-checks">
          {choices.map((choice) => (
            <label key={choice.id} className="p-check">
              <input type="checkbox" checked={stateIds.includes(choice.id)} onChange={() => toggle(choice.id)} />
              <span>{choice.name}{choice.active === false ? " (inactive)" : ""}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Product image" hint={image?.id ? `Uploaded: ${image.name}` : hasImage ? "An image is set. Choose a file to replace it." : "PNG, JPEG or WebP, up to 25 MB."} wide>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => chooseImage(e.target.files?.[0])} />
      </Field>
      {hasImage && <div className="is-wide"><button type="button" className="p-link-btn is-danger" onClick={() => setImage({ id: null, name: "" })}>Remove image</button></div>}

      <label className="p-check is-wide"><input type="checkbox" name="active" defaultChecked={product?.active ?? true} /><span>Active — visible to partners in its states</span></label>

      {state.error && <div className="is-wide"><Notice tone="error">{state.error}</Notice></div>}
      <div className="p-form-actions is-wide"><button className="p-btn" type="submit" disabled={state.busy}>{state.busy ? "Saving…" : product ? "Save product" : "Add product"}</button></div>
    </form>
  );
}
