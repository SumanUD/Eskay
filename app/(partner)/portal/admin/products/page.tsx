"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, uploadFile } from "../../../_lib/api";
import { rupees, toPaise, toRupeeInput } from "../../../_lib/format";
import { Icon } from "../../../_lib/icons";
import { RoleGate, useApi } from "../../../_lib/session";
import type { Product, State, StateRef } from "../../../_lib/types";
import { Dialog, EmptyState, Field, Loading, Notice, PageHeader, ProductImage } from "../../../_lib/ui";

const MAX_IMAGES = 8;

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
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  async function remove(product: Product) {
    if (!window.confirm(`Delete ${product.name}? Its images go with it. To hide it from partners instead, edit it and untick Active.`)) return;
    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      setMessage({ tone: "success", text: `${product.name} was deleted.` });
      products.reload();
    } catch (failure) {
      setMessage({ tone: "error", text: (failure as Error).message });
    }
  }

  const activeStates = (states.data?.states ?? []).filter((state) => state.active);
  const all = products.data?.products ?? [];
  const shown = all.filter((product) => {
    const needle = query.trim().toLowerCase();
    const matches = !needle || `${product.name} ${product.code} ${product.brand}`.toLowerCase().includes(needle);
    return matches && (!stateFilter || product.states.some((s) => String(s.id) === stateFilter));
  });
  const regionText = (list: StateRef[]) => (list.length === activeStates.length && activeStates.length > 1 ? "All states" : list.map((s) => s.name).join(", "));

  return (
    <>
      <PageHeader
        title="Products"
        description="The product master: prices for each partner type, shelf prices, images and the states each product is released in."
        actions={<button className="p-btn" type="button" onClick={() => setEditing("new")} disabled={!activeStates.length}><Icon name="plus" />Add product</button>}
      />
      {states.data && !activeStates.length && <Notice tone="warning">Add a state first. Every product must be released in at least one state. <Link href="/portal/admin/states">Go to States</Link></Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {products.loading && <Loading />}
      {products.error && <Notice tone="error">{products.error}</Notice>}
      {products.data && !all.length && <EmptyState title="No products yet">Add the first product. Partners see it once it is active in their state.</EmptyState>}
      {all.length > 0 && (
        <>
          <div className="p-toolbar">
            <input className="p-search" type="search" placeholder="Search by name, code or brand" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} aria-label="Filter by state">
              <option value="">All states</option>
              {activeStates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="p-count">{shown.length} of {all.length}</span>
          </div>
          {!shown.length && <EmptyState title="No products match" />}
          {shown.length > 0 && (
            <div className="p-table-wrap">
              <table className="p-table">
                <thead>
                  <tr><th aria-label="Image" /><th>Product</th><th className="num">Distributor</th><th className="num">Dealer</th><th className="num">MRP</th><th>Region</th><th>Status</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {shown.map((product) => (
                    <tr key={product.id}>
                      <td><ProductImage product={product} className="is-thumb" /></td>
                      <td>
                        <Link href={`/portal/product?id=${product.id}`}><strong>{product.name}</strong></Link>
                        <small className="p-sub p-meta-row">
                          <span className="p-code">{product.code}</span>
                          {product.brand && <span>{product.brand}</span>}
                          {product.pack_size && <span>{product.pack_size}</span>}
                          {product.images.length > 1 && <span>{product.images.length} images</span>}
                        </small>
                      </td>
                      <td className="num">{rupees(product.distributor_price ?? 0)}</td>
                      <td className="num">{rupees(product.dealer_price ?? 0)}</td>
                      <td className="num">{product.mrp !== null ? rupees(product.mrp) : "—"}</td>
                      <td><span title={product.states.map((s) => s.name).join(", ")}>{regionText(product.states)}</span></td>
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
        </>
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

// An image in the form: one already on the product (shown through its product image id), or one
// just uploaded (shown from the chosen file on this device).
type ImageItem = { fileId: number; imageId?: number; localUrl?: string; name: string };

function ProductForm({ product, states, onSaved }: { product: Product | null; states: State[]; onSaved: (product: Product, created: boolean) => void }) {
  const [stateIds, setStateIds] = useState<number[]>(() => product?.states.map((s) => s.id) ?? []);
  const [images, setImages] = useState<ImageItem[]>(() =>
    (product?.image_file_ids ?? []).map((fileId, index) => ({ fileId, imageId: product?.images[index], name: `Image ${index + 1}` })),
  );
  const [state, setState] = useState({ busy: false, error: "" });
  const [uploading, setUploading] = useState(0);

  // Previews of new uploads are held in memory only while the form is open.
  useEffect(() => () => images.forEach((image) => image.localUrl && URL.revokeObjectURL(image.localUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    const chosen = [...files].slice(0, room);
    if (!chosen.length) return setState({ busy: false, error: `A product can have up to ${MAX_IMAGES} images.` });
    setState({ busy: false, error: files.length > room ? `Only ${room} more image${room === 1 ? "" : "s"} could be added; a product can have up to ${MAX_IMAGES}.` : "" });
    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const uploaded = await uploadFile(file);
        setImages((current) => [...current, { fileId: uploaded.id, localUrl: URL.createObjectURL(file), name: uploaded.original_name }]);
      } catch (failure) {
        setState({ busy: false, error: `${file.name}: ${(failure as Error).message}` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const move = (index: number, by: number) =>
    setImages((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  const removeImage = (index: number) => setImages((current) => current.filter((_, i) => i !== index));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const distributorPrice = toPaise(String(data.get("distributor_price")));
    const dealerPrice = toPaise(String(data.get("dealer_price")));
    if (distributorPrice === null || dealerPrice === null) return setState({ busy: false, error: "Enter the distributor and dealer prices in rupees, for example 1250 or 1250.50." });
    const optional = (name: string) => {
      const raw = String(data.get(name) ?? "").trim();
      return raw === "" ? null : toPaise(raw);
    };
    const mrp = optional("mrp");
    const retail = optional("retail_price");
    if ((String(data.get("mrp")).trim() && mrp === null) || (String(data.get("retail_price")).trim() && retail === null)) {
      return setState({ busy: false, error: "Enter MRP and the retail counter price in rupees, or leave them empty." });
    }
    if (!stateIds.length) return setState({ busy: false, error: "Choose at least one state this product is released in." });
    const body = {
      name: data.get("name"), code: data.get("code"), brand: data.get("brand"), category: data.get("category"), pack_size: data.get("pack_size"),
      description: data.get("description"), distributor_price: distributorPrice, dealer_price: dealerPrice, mrp, retail_price: retail,
      state_ids: stateIds, image_file_ids: images.map((image) => image.fileId), active: data.get("active") === "on",
    };
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

  const rupeeValue = (paise: number | null | undefined) => (paise === null || paise === undefined ? "" : toRupeeInput(paise));

  return (
    <form className="p-form p-grid-form" onSubmit={submit}>
      <p className="p-form-section is-wide">Product</p>
      <Field label="Product name" required><input name="name" defaultValue={product?.name} minLength={2} maxLength={120} required placeholder="e.g. Signature Box 24×20" /></Field>
      <Field label="Product code" hint="Unique; stored in capitals." required><input name="code" defaultValue={product?.code} maxLength={40} required /></Field>
      <Field label="Brand"><input name="brand" defaultValue={product?.brand} maxLength={80} placeholder="e.g. ESKAY" /></Field>
      <Field label="Category"><input name="category" defaultValue={product?.category} maxLength={60} /></Field>
      <Field label="Pack size" hint="As printed, e.g. 24 packs × 20 pouches." wide><input name="pack_size" defaultValue={product?.pack_size} maxLength={120} /></Field>

      <p className="p-form-section is-wide">Prices</p>
      <Field label="Distributor price (₹)" hint="Shown to distributors only." required><input name="distributor_price" inputMode="decimal" defaultValue={rupeeValue(product?.distributor_price)} required /></Field>
      <Field label="Dealer price (₹)" hint="Shown to dealers only." required><input name="dealer_price" inputMode="decimal" defaultValue={rupeeValue(product?.dealer_price)} required /></Field>
      <Field label="MRP (₹)" hint="Shown to every partner."><input name="mrp" inputMode="decimal" defaultValue={rupeeValue(product?.mrp)} /></Field>
      <Field label="Retail counter price (₹)" hint="Shown to every partner."><input name="retail_price" inputMode="decimal" defaultValue={rupeeValue(product?.retail_price)} /></Field>
      <Field label="Description" wide><textarea name="description" rows={3} defaultValue={product?.description} maxLength={5000} /></Field>

      <RegionPicker states={states} current={product?.states ?? []} value={stateIds} onChange={setStateIds} />

      <fieldset className="p-fieldset is-wide">
        <legend>Images</legend>
        <p className="p-hint">Up to {MAX_IMAGES} images: PNG, JPEG or WebP. The first image is the cover partners see in the product list.</p>
        {images.length > 0 && (
          <ol className="p-image-list">
            {images.map((image, index) => (
              <li key={`${image.fileId}-${index}`}>
                {image.localUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file on this device.
                  <img src={image.localUrl} alt="" />
                ) : product && image.imageId ? (
                  <ProductImage product={product} imageId={image.imageId} />
                ) : null}
                <span className="p-image-tag">{index === 0 ? "Cover" : index + 1}</span>
                <span className="p-image-actions">
                  <button type="button" className="p-icon-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move image ${index + 1} earlier`}>‹</button>
                  <button type="button" className="p-icon-btn" onClick={() => move(index, 1)} disabled={index === images.length - 1} aria-label={`Move image ${index + 1} later`}>›</button>
                  <button type="button" className="p-icon-btn is-danger" onClick={() => removeImage(index)} aria-label={`Remove image ${index + 1}`}>×</button>
                </span>
              </li>
            ))}
          </ol>
        )}
        {images.length < MAX_IMAGES && (
          <label className="p-upload">
            <Icon name="camera" />
            <span>{uploading ? `Uploading ${uploading}…` : images.length ? "Add more images" : "Add images"}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </fieldset>

      <label className="p-check is-wide"><input type="checkbox" name="active" defaultChecked={product?.active ?? true} /><span>Active: visible to partners in the selected states</span></label>

      {state.error && <div className="is-wide"><Notice tone="error">{state.error}</Notice></div>}
      <div className="p-form-actions is-wide"><button className="p-btn" type="submit" disabled={state.busy || uploading > 0}>{state.busy ? "Saving…" : product ? "Save product" : "Add product"}</button></div>
    </form>
  );
}

/** Choosing the states a product is released in, with search for a long list of states. */
function RegionPicker({ states, current, value, onChange }: { states: State[]; current: StateRef[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  // A product may be flagged for a state that has since been deactivated; keep it listed so the
  // flag can be seen and removed rather than silently kept.
  const choices = useMemo(
    () => [...states, ...current.filter((s) => !states.some((active) => active.id === s.id)).map((s) => ({ ...s, code: null, active: false }))],
    [states, current],
  );
  const needle = query.trim().toLowerCase();
  const shown = choices.filter((choice) => !needle || choice.name.toLowerCase().includes(needle));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <fieldset className="p-fieldset is-wide">
      <legend>Region: released in<b aria-hidden="true">*</b></legend>
      <p className="p-hint">When regional products are switched on in Settings, partners see only products released in their own state.</p>
      <div className="p-check-actions">
        {choices.length > 8 && <input className="p-search is-small" type="search" placeholder="Find a state" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a state" />}
        <span className="p-count">{value.length} of {states.length} selected</span>
        <button type="button" className="p-link-btn" onClick={() => onChange(states.map((s) => s.id))}>Select all</button>
        <button type="button" className="p-link-btn" onClick={() => onChange([])}>Clear</button>
      </div>
      <div className="p-checks">
        {shown.map((choice) => (
          <label key={choice.id} className={value.includes(choice.id) ? "p-check is-on" : "p-check"}>
            <input type="checkbox" checked={value.includes(choice.id)} onChange={() => toggle(choice.id)} />
            <span>{choice.name}{choice.active === false ? " (inactive)" : ""}</span>
          </label>
        ))}
        {!shown.length && <p className="p-muted">No state matches “{query}”.</p>}
      </div>
    </fieldset>
  );
}
