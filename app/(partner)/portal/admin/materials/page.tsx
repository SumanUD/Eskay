"use client";

import { FormEvent, useState } from "react";
import { api, downloadFile, uploadFile, type UploadedFile } from "../../../_lib/api";
import { fileSize, formatDate } from "../../../_lib/format";
import { Icon } from "../../../_lib/icons";
import { RoleGate, useApi } from "../../../_lib/session";
import type { Audience, Material, Product, User } from "../../../_lib/types";
import { Dialog, EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: "distributor", label: "Distributors", hint: "All distributors, or the ones you pick" },
  { value: "dealer", label: "Dealers", hint: "All dealers, or the ones you pick" },
  { value: "all", label: "Both", hint: "Every distributor and dealer" },
];

// Who a material reaches, in words: a whole group, or a count of named partners.
function reach(material: Material) {
  const group = material.audience === "all" ? "All distributors and dealers" : material.audience === "distributor" ? "All distributors" : "All dealers";
  const named = material.recipients ?? [];
  if (!named.length) return { title: group, detail: "" };
  const word = material.audience === "distributor" ? "distributor" : "dealer";
  return { title: `${named.length} selected ${word}${named.length === 1 ? "" : "s"}`, detail: named.map((r) => r.name).join(", ") };
}

export default function AdminMaterialsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminMaterials />
    </RoleGate>
  );
}

function AdminMaterials() {
  const materials = useApi<{ materials: Material[] }>("/materials");
  const products = useApi<{ products: Product[] }>("/products");
  const users = useApi<{ users: User[] }>("/users");
  const [editing, setEditing] = useState<Material | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function remove(material: Material) {
    if (!window.confirm(`Delete "${material.title}"? The file will be removed for everyone.`)) return;
    try {
      await api(`/materials/${material.id}`, { method: "DELETE" });
      setMessage({ tone: "success", text: "Material deleted." });
      materials.reload();
    } catch (failure) {
      setMessage({ tone: "error", text: (failure as Error).message });
    }
  }

  const partners = (users.data?.users ?? []).filter((u) => u.active && (u.role === "distributor" || u.role === "dealer"));

  return (
    <>
      <PageHeader
        title="Downloadable material"
        description="Files for partners to download. Choose distributors, dealers or both, and narrow it to named partners if needed. Everyone it reaches is emailed."
        actions={<button className="p-btn" type="button" onClick={() => setEditing("new")}><Icon name="plus" />Upload material</button>}
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {materials.loading && <Loading />}
      {materials.error && <Notice tone="error">{materials.error}</Notice>}
      {materials.data && !materials.data.materials.length && <EmptyState title="No material uploaded yet">Upload price lists, brochures or documents for your partners.</EmptyState>}
      {materials.data && materials.data.materials.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>Material</th><th>Visible to</th><th>Product</th><th>File</th><th>Added</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {materials.data.materials.map((material) => {
                const who = reach(material);
                return (
                  <tr key={material.id}>
                    <td><strong>{material.title}</strong>{material.description && <small className="p-sub p-clamp">{material.description}</small>}</td>
                    <td>{who.title}{who.detail && <small className="p-sub p-clamp" title={who.detail}>{who.detail}</small>}</td>
                    <td>{material.product ?? "—"}</td>
                    <td>{material.file_name}<small className="p-sub">{fileSize(material.file_size)}</small></td>
                    <td>{formatDate(material.created_at)}</td>
                    <td className="p-row-actions">
                      <button type="button" className="p-link-btn" onClick={() => setEditing(material)}>Edit</button>
                      <button type="button" className="p-link-btn" onClick={() => downloadFile(`/materials/${material.id}/download`, material.file_name)}>Download</button>
                      <button type="button" className="p-link-btn is-danger" onClick={() => remove(material)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Upload material" : "Edit material"} wide>
        {editing !== null && (
          <MaterialForm
            material={editing === "new" ? null : editing}
            products={products.data?.products ?? []}
            partners={partners}
            onSaved={(created) => {
              setEditing(null);
              setMessage({ tone: "success", text: created ? "Material uploaded. Everyone it is visible to has been emailed." : "Material saved. Anyone newly added has been emailed." });
              materials.reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function MaterialForm({ material, products, partners, onSaved }: { material: Material | null; products: Product[]; partners: User[]; onSaved: (created: boolean) => void }) {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [audience, setAudience] = useState<Audience>(material?.audience ?? "distributor");
  const [picked, setPicked] = useState<number[]>(() => material?.recipients?.map((r) => r.id) ?? []);
  const [onlySome, setOnlySome] = useState(Boolean(material?.recipients?.length));
  const [state, setState] = useState({ busy: false, error: "" });

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    setState({ busy: true, error: "" });
    try {
      setFile(await uploadFile(chosen));
      setState({ busy: false, error: "" });
    } catch (failure) {
      setFile(null);
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  // Changing the group clears the named partners, who belonged to the previous group.
  function chooseAudience(value: Audience) {
    setAudience(value);
    setPicked([]);
    if (value === "all") setOnlySome(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!material && !file) return setState({ busy: false, error: "Choose a file to upload." });
    const recipients = audience !== "all" && onlySome ? picked : [];
    if (audience !== "all" && onlySome && !recipients.length) return setState({ busy: false, error: `Pick at least one ${audience}, or choose all ${audience}s.` });
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      title: data.get("title"), description: data.get("description"), audience,
      product_id: data.get("product_id") ? Number(data.get("product_id")) : null, recipient_ids: recipients,
    };
    if (file) body.file_id = file.id;
    setState({ busy: true, error: "" });
    try {
      if (material) await api(`/materials/${material.id}`, { method: "PATCH", body });
      else await api("/materials", { method: "POST", body });
      onSaved(!material);
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  return (
    <form className="p-form p-grid-form" onSubmit={submit}>
      <Field label="File" hint={file ? `Uploaded: ${file.original_name} (${fileSize(file.size)})` : material ? `Current: ${material.file_name}. Choose a file only to replace it.` : "PDF, image, Word, Excel, PowerPoint, CSV or ZIP, up to 25 MB."} required={!material} wide>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.csv,.zip" onChange={(e) => choose(e.target.files?.[0])} />
      </Field>
      <Field label="Title" required><input name="title" minLength={2} maxLength={120} required defaultValue={material?.title ?? (file ? file.original_name.replace(/\.[^.]+$/, "") : undefined)} key={file?.id ?? "empty"} /></Field>
      <Field label="Linked product" hint="Optional. Also shown on that product's page, and only where the product is visible.">
        <select name="product_id" defaultValue={material?.product_id ?? ""}>
          <option value="">General (not linked to a product)</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>
      </Field>
      <Field label="Description" wide><textarea name="description" rows={2} maxLength={2000} defaultValue={material?.description} /></Field>

      <fieldset className="p-fieldset is-wide">
        <legend>Visible to<b aria-hidden="true">*</b></legend>
        <div className="p-choice-row" role="radiogroup" aria-label="Visible to">
          {AUDIENCES.map((option) => (
            <label key={option.value} className={audience === option.value ? "p-choice is-on" : "p-choice"}>
              <input type="radio" name="audience" value={option.value} checked={audience === option.value} onChange={() => chooseAudience(option.value)} />
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </label>
          ))}
        </div>
        {audience !== "all" && (
          <>
            <div className="p-choice-inline">
              <label className="p-check"><input type="radio" name="scope" checked={!onlySome} onChange={() => setOnlySome(false)} /><span>All {audience}s</span></label>
              <label className="p-check"><input type="radio" name="scope" checked={onlySome} onChange={() => setOnlySome(true)} /><span>Only the {audience}s I pick</span></label>
            </div>
            {onlySome && <RecipientPicker role={audience} partners={partners} value={picked} onChange={setPicked} />}
          </>
        )}
      </fieldset>

      {state.error && <div className="is-wide"><Notice tone="error">{state.error}</Notice></div>}
      <div className="p-form-actions is-wide"><button className="p-btn" type="submit" disabled={state.busy || (!material && !file)}>{state.busy ? "Working…" : material ? "Save material" : "Upload and share"}</button></div>
    </form>
  );
}

/** Choosing named distributors or dealers, with search; dealers show whose network they are in. */
function RecipientPicker({ role, partners, value, onChange }: { role: "distributor" | "dealer"; partners: User[]; value: number[]; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState("");
  const pool = partners.filter((p) => p.role === role);
  const needle = query.trim().toLowerCase();
  const shown = pool.filter((p) => !needle || `${p.name} ${p.organisation} ${p.state ?? ""} ${p.distributor ?? ""}`.toLowerCase().includes(needle));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  if (!pool.length) return <Notice tone="warning">There are no active {role}s yet.</Notice>;
  return (
    <div className="p-picker">
      <div className="p-check-actions">
        <input className="p-search is-small" type="search" placeholder={`Find a ${role}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Find a ${role}`} />
        <span className="p-count">{value.length} of {pool.length} selected</span>
        <button type="button" className="p-link-btn" onClick={() => onChange([...new Set([...value, ...shown.map((p) => p.id)])])}>Select {needle ? "these" : "all"}</button>
        <button type="button" className="p-link-btn" onClick={() => onChange([])}>Clear</button>
      </div>
      <div className="p-picker-list">
        {shown.map((p) => (
          <label key={p.id} className={value.includes(p.id) ? "p-check is-on" : "p-check"}>
            <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
            <span>
              <strong>{p.name}</strong>
              <small>{[p.organisation, p.state, role === "dealer" && p.distributor ? `under ${p.distributor}` : ""].filter(Boolean).join(" · ")}</small>
            </span>
          </label>
        ))}
        {!shown.length && <p className="p-muted">No {role} matches “{query}”.</p>}
      </div>
    </div>
  );
}
