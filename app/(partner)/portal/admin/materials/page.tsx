"use client";

import { FormEvent, useState } from "react";
import { api, downloadFile, uploadFile, type UploadedFile } from "../../../_lib/api";
import { AUDIENCE_LABEL, fileSize, formatDate } from "../../../_lib/format";
import { RoleGate, useApi } from "../../../_lib/session";
import type { Audience, Material, Product } from "../../../_lib/types";
import { Dialog, EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

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
  const [adding, setAdding] = useState(false);
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

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Downloadable material"
        description="Files partners can download. Material linked to a product is hidden wherever that product is hidden."
        actions={<button className="p-btn" type="button" onClick={() => setAdding(true)}>Upload material</button>}
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {materials.loading && <Loading />}
      {materials.error && <Notice tone="error">{materials.error}</Notice>}
      {materials.data && !materials.data.materials.length && <EmptyState title="No material uploaded yet">Upload price lists, brochures or documents for your partners.</EmptyState>}
      {materials.data && materials.data.materials.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>Material</th><th>For</th><th>Product</th><th>File</th><th>Added</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {materials.data.materials.map((material) => (
                <tr key={material.id}>
                  <td><strong>{material.title}</strong>{material.description && <small className="p-sub p-clamp">{material.description}</small>}</td>
                  <td>{AUDIENCE_LABEL[material.audience]}</td>
                  <td>{material.product ?? "—"}</td>
                  <td>{material.file_name}<small className="p-sub">{fileSize(material.file_size)}</small></td>
                  <td>{formatDate(material.created_at)}</td>
                  <td className="p-row-actions">
                    <button type="button" className="p-link-btn" onClick={() => downloadFile(`/materials/${material.id}/download`, material.file_name)}>Download</button>
                    <button type="button" className="p-link-btn is-danger" onClick={() => remove(material)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Upload material">
        {adding && (
          <MaterialForm
            products={products.data?.products ?? []}
            onSaved={() => {
              setAdding(false);
              setMessage({ tone: "success", text: "Material uploaded." });
              materials.reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function MaterialForm({ products, onSaved }: { products: Product[]; onSaved: () => void }) {
  const [file, setFile] = useState<UploadedFile | null>(null);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setState({ busy: false, error: "Choose a file to upload." });
    const data = new FormData(event.currentTarget);
    setState({ busy: true, error: "" });
    try {
      await api("/materials", {
        method: "POST",
        body: { title: data.get("title"), description: data.get("description"), audience: data.get("audience") as Audience, product_id: data.get("product_id") ? Number(data.get("product_id")) : null, file_id: file.id },
      });
      onSaved();
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  return (
    <form className="p-form" onSubmit={submit}>
      <Field label="File" hint={file ? `Uploaded: ${file.original_name} (${fileSize(file.size)})` : "PDF, image, Word, Excel, PowerPoint, CSV or ZIP, up to 25 MB."} required>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.csv,.zip" onChange={(e) => choose(e.target.files?.[0])} />
      </Field>
      <Field label="Title" required><input name="title" minLength={2} maxLength={120} required defaultValue={file ? file.original_name.replace(/\.[^.]+$/, "") : undefined} key={file?.id ?? "empty"} /></Field>
      <Field label="Description"><textarea name="description" rows={3} maxLength={2000} /></Field>
      <Field label="Who can download it" required>
        <select name="audience" defaultValue="all">
          {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((value) => <option key={value} value={value}>{AUDIENCE_LABEL[value]}</option>)}
        </select>
      </Field>
      <Field label="Linked product" hint="Optional. Shown on that product's page, and only where the product is visible.">
        <select name="product_id" defaultValue="">
          <option value="">General — not linked to a product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>
      </Field>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="p-form-actions"><button className="p-btn" type="submit" disabled={state.busy || !file}>{state.busy ? "Working…" : "Save material"}</button></div>
    </form>
  );
}
