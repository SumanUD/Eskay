"use client";

import { FormEvent, useState } from "react";
import { api, uploadAvatar } from "../../_lib/api";
import { formatDateTime, ROLE_LABEL } from "../../_lib/format";
import { Icon } from "../../_lib/icons";
import { useSession } from "../../_lib/session";
import { PasswordForm } from "../../_lib/shell";
import type { User } from "../../_lib/types";
import { Avatar, Field, Notice, PageHeader } from "../../_lib/ui";

type Status = { busy: boolean; tone?: "success" | "error"; text?: string };

// Partners change only their picture and password here; everything else about their account,
// including the email they sign in with, is set by an admin. Admins can edit their own details.
export default function ProfilePage() {
  const { user } = useSession();
  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader title="My profile" description={isAdmin ? undefined : "Your account details are managed by ESKAY. You can change your profile picture and your password."} />
      <div className={isAdmin ? "p-profile-grid" : "p-profile-grid is-pair"}>
        <section className="p-card p-profile-card">
          <PictureEditor />
          <dl className="p-facts">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            {user.organisation && <div><dt>Organisation</dt><dd>{user.organisation}</dd></div>}
            {user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}
            {user.address && <div><dt>Address</dt><dd>{user.address}</dd></div>}
            {user.state && <div><dt>State</dt><dd>{user.state}</dd></div>}
            {user.distributor && <div><dt>Distributor</dt><dd>{user.distributor}</dd></div>}
            {user.sales_manager && <div><dt>Area sales manager</dt><dd>{user.sales_manager}</dd></div>}
            {user.last_login_at && <div><dt>Last sign-in</dt><dd>{formatDateTime(user.last_login_at)}</dd></div>}
          </dl>
          {!isAdmin && <p className="p-plain p-muted">To change your email or any other detail, please contact your ESKAY representative.</p>}
        </section>

        {isAdmin && <AdminDetails />}

        <section>
          <h2 className="p-card-title p-outside">Change password</h2>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}

function PictureEditor() {
  const { user, setUser, avatarVersion } = useSession();
  const [status, setStatus] = useState<Status>({ busy: false });

  async function change(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setStatus({ busy: false, tone: "error", text: "Choose a picture under 5 MB." });
    setStatus({ busy: true });
    try {
      const { user: updated } = await uploadAvatar<{ user: User }>(file);
      setUser(updated);
      setStatus({ busy: false, tone: "success", text: "Your profile picture has been updated." });
    } catch (failure) {
      setStatus({ busy: false, tone: "error", text: (failure as Error).message });
    }
  }

  async function remove() {
    setStatus({ busy: true });
    try {
      const { user: updated } = await api<{ user: User }>("/me/avatar", { method: "DELETE" });
      setUser(updated);
      setStatus({ busy: false, tone: "success", text: "Your profile picture has been removed." });
    } catch (failure) {
      setStatus({ busy: false, tone: "error", text: (failure as Error).message });
    }
  }

  return (
    <div className="p-picture">
      <Avatar name={user.name} hasAvatar={user.has_avatar} source="me" version={avatarVersion} className="is-xl" />
      <div>
        <h2 className="p-card-title">{user.name}</h2>
        <div className="p-picture-actions">
          <label className="p-btn is-ghost p-file-btn">
            <Icon name="camera" />
            {status.busy ? "Saving…" : user.has_avatar ? "Change picture" : "Add a picture"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={status.busy} onChange={(e) => { change(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {user.has_avatar && <button type="button" className="p-link-btn is-danger" onClick={remove} disabled={status.busy}>Remove</button>}
        </div>
        <small className="p-muted">PNG, JPEG or WebP, up to 5 MB.</small>
      </div>
      {status.text && <div className="p-picture-status"><Notice tone={status.tone}>{status.text}</Notice></div>}
    </div>
  );
}

function AdminDetails() {
  const { user, setUser } = useSession();
  const [status, setStatus] = useState<Status>({ busy: false });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ busy: true });
    try {
      const { user: updated } = await api<{ user: User }>("/me", {
        method: "PATCH",
        body: { name: data.get("name"), email: data.get("email"), organisation: data.get("organisation"), phone: data.get("phone"), address: data.get("address") },
      });
      setUser(updated);
      setStatus({ busy: false, tone: "success", text: "Your details have been saved." });
    } catch (failure) {
      setStatus({ busy: false, tone: "error", text: (failure as Error).message });
    }
  }

  return (
    <form className="p-card p-form" onSubmit={save}>
      <h2 className="p-card-title">Your details</h2>
      <Field label="Full name" required><input name="name" defaultValue={user.name} minLength={2} maxLength={100} required /></Field>
      <Field label="Email" hint="Used to sign in." required><input name="email" type="email" defaultValue={user.email} maxLength={254} required /></Field>
      <Field label="Organisation"><input name="organisation" defaultValue={user.organisation} maxLength={120} /></Field>
      <Field label="Phone"><input name="phone" type="tel" defaultValue={user.phone} maxLength={20} /></Field>
      <Field label="Address"><textarea name="address" rows={2} defaultValue={user.address} maxLength={300} /></Field>
      {status.text && <Notice tone={status.tone}>{status.text}</Notice>}
      <div className="p-form-actions"><button className="p-btn" type="submit" disabled={status.busy}>{status.busy ? "Saving…" : "Save details"}</button></div>
    </form>
  );
}
