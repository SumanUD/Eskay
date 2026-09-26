"use client";

import { FormEvent, useState } from "react";
import { api } from "../../../_lib/api";
import { AUDIENCE_LABEL, schemePeriod } from "../../../_lib/format";
import { RoleGate, useApi } from "../../../_lib/session";
import type { Audience, Scheme } from "../../../_lib/types";
import { Dialog, EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

export default function AdminSchemesPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminSchemes />
    </RoleGate>
  );
}

const STATUS_TEXT = { current: "Running", upcoming: "Upcoming", expired: "Ended" } as const;

function AdminSchemes() {
  const schemes = useApi<{ schemes: Scheme[] }>("/schemes");
  const [editing, setEditing] = useState<Scheme | "new" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function remove(scheme: Scheme) {
    if (!window.confirm(`Delete the scheme "${scheme.title}"?`)) return;
    try {
      await api(`/schemes/${scheme.id}`, { method: "DELETE" });
      setMessage({ tone: "success", text: "Scheme deleted." });
      schemes.reload();
    } catch (failure) {
      setMessage({ tone: "error", text: (failure as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Schemes"
        description="Partners see a scheme while it is active and has not ended. Upcoming schemes are shown as starting soon."
        actions={<button className="p-btn" type="button" onClick={() => setEditing("new")}>Add scheme</button>}
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {schemes.loading && <Loading />}
      {schemes.error && <Notice tone="error">{schemes.error}</Notice>}
      {schemes.data && !schemes.data.schemes.length && <EmptyState title="No schemes yet" />}
      {schemes.data && schemes.data.schemes.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>Scheme</th><th>For</th><th>Period</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {schemes.data.schemes.map((scheme) => (
                <tr key={scheme.id}>
                  <td><strong>{scheme.title}</strong>{scheme.description && <small className="p-sub p-clamp">{scheme.description}</small>}</td>
                  <td>{AUDIENCE_LABEL[scheme.audience]}</td>
                  <td>{schemePeriod(scheme)}</td>
                  <td>{!scheme.active ? <span className="p-badge is-muted">Paused</span> : <span className={`p-badge scheme-${scheme.status}`}>{STATUS_TEXT[scheme.status]}</span>}</td>
                  <td className="p-row-actions">
                    <button type="button" className="p-link-btn" onClick={() => setEditing(scheme)}>Edit</button>
                    <button type="button" className="p-link-btn is-danger" onClick={() => remove(scheme)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add scheme" : "Edit scheme"}>
        {editing !== null && (
          <SchemeForm
            scheme={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              setMessage({ tone: "success", text: "Scheme saved." });
              schemes.reload();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function SchemeForm({ scheme, onSaved }: { scheme: Scheme | null; onSaved: () => void }) {
  const [state, setState] = useState({ busy: false, error: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      title: data.get("title"), description: data.get("description"), audience: data.get("audience") as Audience,
      starts_on: data.get("starts_on") || null, ends_on: data.get("ends_on") || null, active: data.get("active") === "on",
    };
    setState({ busy: true, error: "" });
    try {
      await (scheme ? api(`/schemes/${scheme.id}`, { method: "PATCH", body }) : api("/schemes", { method: "POST", body }));
      onSaved();
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  return (
    <form className="p-form" onSubmit={submit}>
      <Field label="Title" required><input name="title" defaultValue={scheme?.title} minLength={2} maxLength={120} required /></Field>
      <Field label="Details"><textarea name="description" rows={5} defaultValue={scheme?.description} maxLength={5000} /></Field>
      <Field label="Who can see it" required>
        <select name="audience" defaultValue={scheme?.audience ?? "all"}>
          {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((value) => <option key={value} value={value}>{AUDIENCE_LABEL[value]}</option>)}
        </select>
      </Field>
      <div className="p-form-row">
        <Field label="Starts on" hint="Optional."><input name="starts_on" type="date" defaultValue={scheme?.starts_on ?? ""} /></Field>
        <Field label="Ends on" hint="Optional. Hidden from partners after this day."><input name="ends_on" type="date" defaultValue={scheme?.ends_on ?? ""} /></Field>
      </div>
      <label className="p-check"><input type="checkbox" name="active" defaultChecked={scheme?.active ?? true} /><span>Active — untick to pause without deleting</span></label>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="p-form-actions"><button className="p-btn" type="submit" disabled={state.busy}>{state.busy ? "Saving…" : "Save scheme"}</button></div>
    </form>
  );
}
