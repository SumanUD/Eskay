"use client";

import { FormEvent, useState } from "react";
import { api } from "../../../_lib/api";
import { RoleGate, useApi } from "../../../_lib/session";
import type { State } from "../../../_lib/types";
import { EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

export default function AdminStatesPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminStates />
    </RoleGate>
  );
}

function AdminStates() {
  const states = useApi<{ states: State[] }>("/states");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: success });
      setEditingId(null);
      states.reload();
      return true;
    } catch (failure) {
      setMessage({ tone: "error", text: (failure as Error).message });
      return false;
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    if (await run(() => api("/states", { method: "POST", body: { name, code: data.get("code") } }), `${name} was added.`)) form.reset();
  }

  function rename(event: FormEvent<HTMLFormElement>, state: State) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(() => api(`/states/${state.id}`, { method: "PATCH", body: { name: data.get("name"), code: data.get("code") } }), "State saved.");
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title="States" description="The regions products can be flagged for. New states can be added at any time and then selected on each product." />
      <form className="p-card p-inline-form" onSubmit={add}>
        <Field label="State name" required><input name="name" minLength={2} maxLength={60} required placeholder="e.g. Jharkhand" /></Field>
        <Field label="Code" hint="Optional short code."><input name="code" maxLength={10} placeholder="JH" /></Field>
        <button className="p-btn" type="submit">Add state</button>
      </form>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {states.loading && <Loading />}
      {states.error && <Notice tone="error">{states.error}</Notice>}
      {states.data && !states.data.states.length && <EmptyState title="No states yet">Add the states you distribute in. Products must be flagged for at least one.</EmptyState>}
      {states.data && states.data.states.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>State</th><th>Code</th><th className="num">Products</th><th className="num">Users</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {states.data.states.map((state) =>
                editingId === state.id ? (
                  <tr key={state.id}>
                    <td colSpan={6}>
                      <form className="p-inline-form is-row" onSubmit={(e) => rename(e, state)}>
                        <input name="name" defaultValue={state.name} minLength={2} maxLength={60} required aria-label="State name" />
                        <input name="code" defaultValue={state.code ?? ""} maxLength={10} aria-label="State code" />
                        <button className="p-btn" type="submit">Save</button>
                        <button className="p-link-btn" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={state.id}>
                    <td><strong>{state.name}</strong></td>
                    <td>{state.code ?? "—"}</td>
                    <td className="num">{state.product_count}</td>
                    <td className="num">{state.user_count}</td>
                    <td>{state.active ? <span className="p-badge is-ok">Active</span> : <span className="p-badge is-muted">Inactive</span>}</td>
                    <td className="p-row-actions">
                      <button type="button" className="p-link-btn" onClick={() => setEditingId(state.id)}>Rename</button>
                      <button type="button" className="p-link-btn" onClick={() => run(() => api(`/states/${state.id}`, { method: "PATCH", body: { active: !state.active } }), `${state.name} ${state.active ? "deactivated" : "reactivated"}.`)}>
                        {state.active ? "Deactivate" : "Reactivate"}
                      </button>
                      {!state.product_count && !state.user_count && (
                        <button type="button" className="p-link-btn is-danger" onClick={() => window.confirm(`Delete ${state.name}?`) && run(() => api(`/states/${state.id}`, { method: "DELETE" }), `${state.name} was deleted.`)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
