"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api } from "../../../_lib/api";
import { formatDateTime, ROLE_LABEL } from "../../../_lib/format";
import { Icon } from "../../../_lib/icons";
import { RoleGate, useApi, useSession } from "../../../_lib/session";
import type { Role, State, User } from "../../../_lib/types";
import { Avatar, Dialog, EmptyState, Field, Loading, Notice, PageHeader } from "../../../_lib/ui";

const TABS: { value: "" | Role; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "distributor", label: "Distributors" },
  { value: "dealer", label: "Dealers" },
  { value: "sales", label: "Area sales managers" },
  { value: "admin", label: "Admins" },
];

type Saved = { user: User; temporary_password?: string; email_sent?: boolean };
type Credentials = { name: string; email: string; password: string; emailed: boolean };

// `useSearchParams` needs a Suspense boundary for this page to be prerendered.
export default function AdminUsersPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Suspense fallback={<Loading />}>
        <AdminUsers />
      </Suspense>
    </RoleGate>
  );
}

const roleFromQuery = (value: string | null): "" | Role => (TABS.some((tab) => tab.value === value) ? (value as Role) : "");

function AdminUsers() {
  const users = useApi<{ users: User[] }>("/users");
  const states = useApi<{ states: State[] }>("/states");
  const [tab, setTab] = useState<"" | Role>(roleFromQuery(useSearchParams().get("role")));
  const [underDistributor, setUnderDistributor] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [message, setMessage] = useState("");

  const everyone = users.data?.users ?? [];
  const distributors = everyone.filter((u) => u.role === "distributor");
  const needle = query.trim().toLowerCase();
  const shown = everyone.filter((u) =>
    (!tab || u.role === tab)
    && (tab !== "dealer" || !underDistributor || String(u.distributor_id) === underDistributor)
    && (!needle || `${u.name} ${u.email} ${u.organisation} ${u.state ?? ""}`.toLowerCase().includes(needle)));

  function saved({ user, temporary_password: password, email_sent: emailed = false }: Saved, created: boolean) {
    setEditing(null);
    setCredentials(password ? { name: user.name, email: user.email, password, emailed } : null);
    setMessage(password ? "" : created ? `${user.name}'s account was created${emailed ? " and their sign-in details were emailed to them" : ""}.` : `${user.name} was saved.`);
    users.reload();
  }

  function chooseTab(value: "" | Role) {
    setTab(value);
    setUnderDistributor("");
  }

  return (
    <>
      <PageHeader
        title="Partners & users"
        description="Every account is created here; there is no public sign-up. Each dealer is mapped to the distributor who supplies them, and each distributor can have an area sales manager."
        actions={<button className="p-btn" type="button" onClick={() => setEditing("new")}><Icon name="plus" />Add user</button>}
      />
      {credentials && <CredentialsNotice credentials={credentials} onDismiss={() => setCredentials(null)} />}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="p-pills" role="group" aria-label="Filter by role">
        {TABS.map((item) => (
          <button key={item.value || "all"} type="button" className={tab === item.value ? "active" : undefined} aria-pressed={tab === item.value} onClick={() => chooseTab(item.value)}>
            {item.label} <span>{item.value ? everyone.filter((u) => u.role === item.value).length : everyone.length}</span>
          </button>
        ))}
      </div>
      {everyone.length > 0 && (
        <div className="p-toolbar">
          <input className="p-search" type="search" placeholder="Search by name, email, organisation or state" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
          {tab === "dealer" && distributors.length > 0 && (
            <select value={underDistributor} onChange={(e) => setUnderDistributor(e.target.value)} aria-label="Filter dealers by distributor">
              <option value="">Under any distributor</option>
              {distributors.map((d) => <option key={d.id} value={d.id}>Under {d.name}</option>)}
            </select>
          )}
          <span className="p-count">{shown.length} shown</span>
        </div>
      )}
      {users.loading && <Loading />}
      {users.error && <Notice tone="error">{users.error}</Notice>}
      {users.data && !shown.length && <EmptyState title="No accounts here yet" />}
      {shown.length > 0 && (
        <div className="p-table-wrap">
          <table className="p-table">
            <thead><tr><th>Name</th><th>Role</th><th>State</th><th>Mapping</th><th>Last sign-in</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {shown.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="p-person">
                      <Avatar name={user.name} hasAvatar={user.has_avatar} source="user" id={user.id} className="is-small" />
                      <span>
                        <strong>{user.name}</strong>
                        <small className="p-sub">{user.email}</small>
                        {user.organisation && <small className="p-sub">{user.organisation}</small>}
                      </span>
                    </span>
                  </td>
                  <td>{ROLE_LABEL[user.role]}</td>
                  <td>{user.state ?? "—"}</td>
                  <td><Mapping user={user} onShowDealers={() => { setTab("dealer"); setUnderDistributor(String(user.id)); setQuery(""); }} /></td>
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

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add user" : `Edit ${editing?.name}`} wide>
        {editing !== null && <UserForm user={editing === "new" ? null : editing} everyone={everyone} states={states.data?.states ?? []} onSaved={saved} />}
      </Dialog>
    </>
  );
}

// Who the account is linked to: a dealer's distributor, or a distributor's manager and dealers.
function Mapping({ user, onShowDealers }: { user: User; onShowDealers: () => void }) {
  if (user.role === "dealer") return user.distributor ? <span>Under <strong>{user.distributor}</strong></span> : <span className="p-badge is-warn">No distributor</span>;
  if (user.role === "distributor") {
    return (
      <span className="p-mapping">
        {user.dealer_count > 0 ? <button type="button" className="p-link-btn" onClick={onShowDealers}>{user.dealer_count} dealer{user.dealer_count === 1 ? "" : "s"}</button> : <span className="p-muted">No dealers yet</span>}
        {user.sales_manager && <small className="p-sub">ASM: {user.sales_manager}</small>}
      </span>
    );
  }
  return <span className="p-muted">—</span>;
}

function CredentialsNotice({ credentials, onDismiss }: { credentials: Credentials; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `ESKAY partner portal\nSign in: ${window.location.origin}/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`;
  return (
    <div className="p-credentials" role="status">
      <div>
        <strong>Temporary password for {credentials.name}</strong>
        <p>
          {credentials.emailed
            ? `We have emailed their sign-in details to ${credentials.email}. The password is shown here once as well, in case the email does not arrive.`
            : "Share this with them securely. It is shown only now."}{" "}
          They must change it when they first sign in.
        </p>
        <code>{credentials.password}</code>
      </div>
      <div className="p-credentials-actions">
        <button type="button" className="p-btn" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined)}>{copied ? "Copied" : "Copy sign-in details"}</button>
        <button type="button" className="p-link-btn" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

function UserForm({ user, everyone, states, onSaved }: { user: User | null; everyone: User[]; states: State[]; onSaved: (saved: Saved, created: boolean) => void }) {
  const { user: me } = useSession();
  const [role, setRole] = useState<Role>(user?.role ?? "distributor");
  const [stateId, setStateId] = useState(user?.state_id ? String(user.state_id) : "");
  const [distributorId, setDistributorId] = useState(user?.distributor_id ? String(user.distributor_id) : "");
  const [state, setState] = useState({ busy: false, error: "" });
  const isSelf = user?.id === me.id;
  const distributors = everyone.filter((u) => u.role === "distributor" && u.active);
  const salesManagers = everyone.filter((u) => u.role === "sales" && u.active);
  const needsState = role === "distributor" || role === "dealer";
  const stateChoices = states.filter((s) => s.active || s.id === user?.state_id);
  const currentDistributorGone = role === "dealer" && user?.distributor_id && !distributors.some((d) => d.id === user.distributor_id);

  // A new dealer usually sits in their distributor's state, so it is filled in when still empty.
  function chooseDistributor(value: string) {
    setDistributorId(value);
    const chosen = distributors.find((d) => String(d.id) === value);
    if (!stateId && chosen?.state_id) setStateId(String(chosen.state_id));
  }

  async function send(body: Record<string, unknown>) {
    setState({ busy: true, error: "" });
    try {
      const result = user
        ? await api<Saved>(`/users/${user.id}`, { method: "PATCH", body })
        : await api<Saved>("/users", { method: "POST", body });
      onSaved(result, !user);
    } catch (failure) {
      setState({ busy: false, error: (failure as Error).message });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = (value: FormDataEntryValue | string | null) => (value ? Number(value) : null);
    if (role === "dealer" && !distributorId) return setState({ busy: false, error: "Choose the distributor this dealer is assigned to." });
    const body: Record<string, unknown> = {
      role, name: data.get("name"), email: data.get("email"), organisation: data.get("organisation"),
      phone: data.get("phone"), address: data.get("address"), state_id: id(stateId),
      distributor_id: role === "dealer" ? id(distributorId) : null,
      sales_manager_id: role === "distributor" ? id(data.get("sales_manager_id")) : null,
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

      {role === "dealer" ? (
        <Field label="Assigned distributor" hint="The distributor who supplies this dealer. Only admins can change it." required>
          <select value={distributorId} onChange={(e) => chooseDistributor(e.target.value)} required>
            <option value="">Choose a distributor</option>
            {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.state ? ` (${d.state})` : ""}</option>)}
          </select>
        </Field>
      ) : role === "distributor" ? (
        <Field label="Area sales manager" hint="Optional. The manager sees this distributor and their dealers.">
          <select name="sales_manager_id" defaultValue={user?.sales_manager_id ?? ""}>
            <option value="">Not assigned</option>
            {salesManagers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.state ? ` (${m.state})` : ""}</option>)}
          </select>
        </Field>
      ) : <div className="p-grid-spacer" aria-hidden="true" />}

      {role === "dealer" && !distributors.length && <div className="is-wide"><Notice tone="warning">There are no active distributors yet. Add a distributor first, then the dealers under them.</Notice></div>}
      {currentDistributorGone && <div className="is-wide"><Notice tone="warning">This dealer&apos;s distributor ({user?.distributor}) is no longer active. Choose another distributor to save.</Notice></div>}

      <Field label="Full name" required><input name="name" defaultValue={user?.name} minLength={2} maxLength={100} required /></Field>
      <Field label="Email" hint="Used to sign in. Partners cannot change it themselves." required><input name="email" type="email" defaultValue={user?.email} maxLength={254} required /></Field>
      <Field label={needsState ? "State" : "State (optional)"} hint={needsState ? "Decides which products this partner sees when regional products are on." : undefined} required={needsState}>
        <select value={stateId} onChange={(e) => setStateId(e.target.value)} required={needsState}>
          <option value="">{needsState ? "Choose a state" : "No state"}</option>
          {stateChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Organisation"><input name="organisation" defaultValue={user?.organisation} maxLength={120} /></Field>
      <Field label="Phone"><input name="phone" type="tel" defaultValue={user?.phone} maxLength={20} /></Field>
      <Field label="Address"><input name="address" defaultValue={user?.address} maxLength={300} /></Field>

      {!user && (
        <Field label="Password" hint="Leave blank to generate a secure temporary password. It is emailed to the new user and shown to you once." wide>
          <input name="password" type="text" autoComplete="off" minLength={8} maxLength={128} />
        </Field>
      )}
      {user && (
        <div className="is-wide p-edit-extras">
          <label className="p-check"><input type="checkbox" name="active" defaultChecked={user.active} disabled={isSelf} /><span>Active: can sign in{isSelf ? " (you cannot deactivate yourself)" : ""}</span></label>
          <button
            type="button"
            className="p-btn is-ghost"
            disabled={state.busy}
            onClick={() => window.confirm(`Reset ${user.name}'s password? They will be signed out and emailed a new temporary password.`) && send({ reset_password: true })}
          >
            Reset password
          </button>
        </div>
      )}
      {user?.role === "distributor" && user.dealer_count > 0 && (
        <p className="p-hint is-wide">{user.dealer_count} dealer{user.dealer_count === 1 ? " is" : "s are"} assigned to {user.name}. If you deactivate this distributor or change their role, reassign those dealers to another distributor. <Link href="/portal/admin/users?role=dealer">See dealers</Link></p>
      )}

      {state.error && <div className="is-wide"><Notice tone="error">{state.error}</Notice></div>}
      <div className="p-form-actions is-wide"><button className="p-btn" type="submit" disabled={state.busy}>{state.busy ? "Saving…" : user ? "Save user" : "Create account"}</button></div>
    </form>
  );
}
