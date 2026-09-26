"use client";

import { FormEvent, useState } from "react";
import { api } from "../../_lib/api";
import { formatDateTime, ROLE_LABEL } from "../../_lib/format";
import { useSession } from "../../_lib/session";
import { PasswordForm } from "../../_lib/shell";
import type { User } from "../../_lib/types";
import { Field, Notice, PageHeader } from "../../_lib/ui";

export default function ProfilePage() {
  const { user, setUser } = useSession();
  const [state, setState] = useState<{ busy: boolean; tone?: "success" | "error"; text?: string }>({ busy: false });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState({ busy: true });
    try {
      const { user: updated } = await api<{ user: User }>("/me", {
        method: "PATCH",
        body: { name: data.get("name"), organisation: data.get("organisation"), phone: data.get("phone"), address: data.get("address") },
      });
      setUser(updated);
      setState({ busy: false, tone: "success", text: "Your details have been saved." });
    } catch (failure) {
      setState({ busy: false, tone: "error", text: (failure as Error).message });
    }
  }

  return (
    <>
      <PageHeader title="My profile" />
      <div className="p-profile-grid">
        <section className="p-card">
          <h2 className="p-card-title">Account</h2>
          {/* Set by ESKAY: role, region and hierarchy decide what an account can see. */}
          <dl className="p-facts">
            <div><dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            {user.state && <div><dt>State</dt><dd>{user.state}</dd></div>}
            {user.distributor && <div><dt>Distributor</dt><dd>{user.distributor}</dd></div>}
            {user.sales_manager && <div><dt>Area sales manager</dt><dd>{user.sales_manager}</dd></div>}
            {user.last_login_at && <div><dt>Last sign-in</dt><dd>{formatDateTime(user.last_login_at)}</dd></div>}
          </dl>
          <p className="p-plain p-muted">To change your email, role or state, please contact ESKAY.</p>
        </section>

        <form className="p-card p-form" onSubmit={save}>
          <h2 className="p-card-title">Contact details</h2>
          <Field label="Full name" required><input name="name" defaultValue={user.name} minLength={2} maxLength={100} required /></Field>
          <Field label="Organisation"><input name="organisation" defaultValue={user.organisation} maxLength={120} /></Field>
          <Field label="Phone"><input name="phone" type="tel" defaultValue={user.phone} maxLength={20} /></Field>
          <Field label="Address"><textarea name="address" rows={3} defaultValue={user.address} maxLength={300} /></Field>
          {state.text && <Notice tone={state.tone}>{state.text}</Notice>}
          <div className="p-form-actions"><button className="p-btn" type="submit" disabled={state.busy}>{state.busy ? "Saving…" : "Save details"}</button></div>
        </form>

        <section>
          <h2 className="p-card-title p-outside">Change password</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}
