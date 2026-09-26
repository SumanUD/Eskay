"use client";

import { FormEvent, useState } from "react";
import { api } from "../../../_lib/api";
import { formatDateTime, ROLE_LABEL } from "../../../_lib/format";
import { RoleGate, useApi, useSession } from "../../../_lib/session";
import type { Role, State, User } from "../../../_lib/types";
import { Dialog, EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

const TABS: { value: "" | Role; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "distributor", label: "Distributors" },
  { value: "dealer", label: "Dealers" },
  { value: "sales", label: "Area sales managers" },
  { value: "admin", label: "Admins" },
];

type Credentials = { name: string; email: string; password: string };

export default function AdminUsersPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminUsers />
    </RoleGate>
  );
}

function AdminUsers() {
  const users = useApi<{ users: User[] }>("/users");
  const states = useApi<{ states: State[] }>("/states");
  const [tab, setTab] = useState<"" | Role>("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [message, setMessage] = useState("");

  const everyone = users.data?.users ?? [];
  const shown = tab ? everyone.filter((u) => u.role === tab) : everyone;
  const linked = (user: User) => (user.role === "dealer" ? user.distributor : user.role === "distributor" ? user.sales_manager : null);

  function saved(user: User, password?: string) {
    setEditing(null);
    setCredentials(password ? { name: user.name, email: user.email, password } : null);
    setMessage(password ? "" : `${user.name} was saved.`);
    users.reload();
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account is created here; there is no public sign-up. New accounts get a temporary password that must be changed at first sign-in."
        actions={<button className="p-btn" type="button" onClick={() => setEditing("new")}>Add user</button>}
      />
      {credentials && <CredentialsNotice credentials={credentials} onDismiss={() => setCredentials(null)} />}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="p-pills" role="group" aria-label="Filter by role">
        {TABS.map((item) => (
          <button key={item.value || "all"} type="button" className={tab === item.value ? "active" : undefined} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
            {item.label} <span>{item.value ? everyone.filter((u) => u.role === item.value).length : everyone.length}</span>
          </button>
        ))}
      </div>
      {users.loading && <Loading />}
      {users.error && <Notice tone="error">{users.error}</Notice>}
      {users.data && !shown.length && <EmptyState title="No accounts here yet" />}
      {shown.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>Name</th><th>Role</th><th>State</th><th>Reports to</th><th>Last sign-in</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {shown.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong><small className="p-sub">{user.email}</small>{user.organisation && <small className="p-sub">{user.organisation}</small>}</td>
                  <td>{ROLE_LABEL[user.role]}</td>
                  <td>{user.state ?? "—"}</td>
                  <td>{linked(user) ?? "—"}</td>
                  <td>{user.last_login_at ? formatDateTime(user.last_login_at) : <span className="p-muted">Never</span>}</td>
                  <td>
                    {!user.active ? <span className="p-badge is-muted">Deactivated</span> : user.must_change_password ? <span className="p-badge is-warn">Awaiting first sign-in</span> : <span className="p-badge is-ok">Active</span>}
                  </td>
                  <td className="p-row-actions"><button type="button" className="p-link-btn" onClick={() => setEditing(user)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add user" : "Edit user"} wide>
        {editing !== null && <UserForm user={editing === "new" ? null : editing} everyone={everyone} states={states.data?.states ?? []} onSaved={saved} />}
      </Dialog>
    </>
  );
}

function CredentialsNotice({ credentials, onDismiss }: { credentials: Credentials; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `ESKAY partner portal\nSign in: ${window.location.origin}/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`;
  return (
    <div className="p-credentials" role="status">
      <div>
        <strong>Temporary password for {credentials.name}</strong>
        <p>Share this with them securely. It is shown only now, and they must change it when they first sign in.</p>
        <code>{credentials.password}</code>
      </div>
      <div className="p-credentials-actions">
        <button type="button" className="p-btn" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined)}>{copied ? "Copied" : "Copy sign-in details"}</button>
        <button type="button" className="p-link-btn" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

function UserForm({ user, everyone, states, onSaved }: { user: User | null; everyone: User[]; states: State[]; onSaved: (user: User, password?: string) => void }) {
  const { user: me } = useSession();
  const [role, setRole] = useState<Role>(user?.role ?? "distributor");
  const [state, setState] = useState({ busy: false, error: "" });
  const isSelf = user?.id === me.id;
  const distributors = everyone.filter((u) => u.role === "distributor" && u.active);
  const salesManagers = everyone.filter((u) => u.role === "sales" && u.active);
  const needsState = role === "distributor" || role === "dealer";
  const stateChoices = states.filter((s) => s.active || s.id === user?.state_id);

  async function send(body: Record<string, unknown>) {
    setState({ busy: true, error: "" });
    try {
      const result = user
        ? await api<{ user: User; temporary_password?: string }>(`/users/${user.id}`, { method: "PATCH", body })
        : await api<{ user: User; temporary_password?: string }>("/users", { method: "POST", body });
      onSaved(result.user, result.temporary_password);
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = (key: string) => (data.get(key) ? Number(data.get(key)) : null);
    const body: Record<string, unknown> = {
      role, name: data.get("name"), email: data.get("email"), organisation: data.get("organisation"),
      phone: data.get("phone"), address: data.get("address"), state_id: id("state_id"),
      distributor_id: role === "dealer" ? id("distributor_id") : null,
      sales_manager_id: role === "distributor" ? id("sales_manager_id") : null,
    };
    // A disabled checkbox is left out of FormData, so the admin's own locked "Active" box would
    // otherwise read as unticked and ask the server to deactivate them.
    if (user && !isSelf) body.active = data.get("active") === "on";
    if (!user && data.get("password")) body.password = data.get("password");
    send(body);
  }

  return (
    <form className="p-form p-grid-form" onSubmit={submit}>
      <Field label="Role" required>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
        </select>
      </Field>
      <Field label={needsState ? "State" : "State (optional)"} hint={needsState ? "Decides which products this partner sees once the regional catalogue is on." : undefined} required={needsState}>
        <select name="state_id" defaultValue={user?.state_id ?? ""} required={needsState}>
          <option value="">{needsState ? "Choose a state" : "No state"}</option>
          {stateChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Full name" required><input name="name" defaultValue={user?.name} minLength={2} maxLength={100} required /></Field>
      <Field label="Email" hint="Used to sign in." required><input name="email" type="email" defaultValue={user?.email} maxLength={254} required /></Field>
      <Field label="Organisation"><input name="organisation" defaultValue={user?.organisation} maxLength={120} /></Field>
      <Field label="Phone"><input name="phone" type="tel" defaultValue={user?.phone} maxLength={20} /></Field>
      <Field label="Address" wide><textarea name="address" rows={2} defaultValue={user?.address} maxLength={300} /></Field>

      {role === "dealer" && (
        <Field label="Distributor" hint="The distributor this dealer is assigned to." wide>
          <select name="distributor_id" defaultValue={user?.distributor_id ?? ""}>
            <option value="">Not assigned</option>
            {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.state ? ` — ${d.state}` : ""}</option>)}
          </select>
        </Field>
      )}
      {role === "distributor" && (
        <Field label="Area sales manager" hint="This manager will see the distributor's orders." wide>
          <select name="sales_manager_id" defaultValue={user?.sales_manager_id ?? ""}>
            <option value="">Not assigned</option>
            {salesManagers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.state ? ` — ${m.state}` : ""}</option>)}
          </select>
        </Field>
      )}

      {!user && (
        <Field label="Password" hint="Leave blank to generate a secure temporary password, which you will be shown once." wide>
          <input name="password" type="text" autoComplete="off" minLength={8} maxLength={128} />
        </Field>
      )}
      {user && (
        <div className="is-wide p-edit-extras">
          <label className="p-check"><input type="checkbox" name="active" defaultChecked={user.active} disabled={isSelf} /><span>Active — can sign in{isSelf ? " (you cannot deactivate yourself)" : ""}</span></label>
          <button
            type="button"
            className="p-btn is-ghost"
            disabled={state.busy}
            onClick={() => window.confirm(`Reset ${user.name}'s password? They will be signed out and given a new temporary password.`) && send({ reset_password: true })}
          >
            Reset password
          </button>
        </div>
      )}

      {state.error && <div className="is-wide"><Notice tone="error">{state.error}</Notice></div>}
      <div className="p-form-actions is-wide"><button className="p-btn" type="submit" disabled={state.busy}>{state.busy ? "Saving…" : user ? "Save user" : "Create account"}</button></div>
    </form>
  );
}
