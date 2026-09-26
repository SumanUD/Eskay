"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, clearToken, getToken, SIGNED_OUT_EVENT } from "./api";
import { ROLE_LABEL } from "./format";
import { SessionContext } from "./session";
import type { Role, User } from "./types";
import { Field, Loading, Notice } from "./ui";

type NavItem = { href: string; label: string; also?: string[] };

// Each role's menu lists exactly its entitlements from the access brief.
const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/portal", label: "Dashboard" },
    { href: "/portal/catalogue", label: "Catalogue", also: ["/portal/product"] },
    { href: "/portal/orders", label: "Orders", also: ["/portal/order"] },
    { href: "/portal/admin/products", label: "Products" },
    { href: "/portal/admin/users", label: "Users" },
    { href: "/portal/admin/states", label: "States" },
    { href: "/portal/admin/schemes", label: "Schemes" },
    { href: "/portal/admin/materials", label: "Materials" },
    { href: "/portal/admin/settings", label: "Settings" },
  ],
  distributor: [
    { href: "/portal", label: "Dashboard" },
    { href: "/portal/catalogue", label: "Catalogue", also: ["/portal/product"] },
    { href: "/portal/orders/new", label: "Place order" },
    { href: "/portal/orders", label: "My orders", also: ["/portal/order"] },
    { href: "/portal/dealers", label: "My dealers" },
    { href: "/portal/schemes", label: "Schemes" },
    { href: "/portal/materials", label: "Downloads" },
  ],
  dealer: [
    { href: "/portal", label: "Overview" },
    { href: "/portal/catalogue", label: "Catalogue", also: ["/portal/product"] },
    { href: "/portal/schemes", label: "Schemes" },
    { href: "/portal/materials", label: "Downloads" },
  ],
  sales: [
    { href: "/portal", label: "Dashboard" },
    { href: "/portal/orders", label: "Area orders", also: ["/portal/order"] },
    { href: "/portal/distributors", label: "My distributors" },
  ],
};

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState("");
  // Remembers the page the menu was opened on, so navigating closes it without an effect.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;

  const goToSignIn = useCallback(() => {
    const here = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [router]);

  useEffect(() => {
    if (!getToken()) return goToSignIn();
    let live = true;
    api<{ user: User }>("/me").then(
      ({ user: me }) => live && setUser(me),
      (error: ApiError) => {
        if (!live) return;
        if (error.status === 401) goToSignIn();
        else setLoadError(error.message);
      },
    );
    window.addEventListener(SIGNED_OUT_EVENT, goToSignIn);
    return () => {
      live = false;
      window.removeEventListener(SIGNED_OUT_EVENT, goToSignIn);
    };
  }, [goToSignIn]);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearToken();
    router.replace("/login");
  }, [router]);

  const session = useMemo(() => (user ? { user, setUser, signOut } : null), [user, signOut]);

  if (loadError) {
    return (
      <div className="p-centre">
        <Notice tone="error">{loadError}</Notice>
        <button className="p-btn" type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (!session) return <div className="p-centre"><Loading label="Opening the partner portal…" /></div>;

  const items = NAV[session.user.role];
  const isActive = (item: NavItem) => pathname === item.href || (item.also ?? []).includes(pathname);

  return (
    <SessionContext.Provider value={session}>
      <div className={menuOpen ? "p-shell menu-open" : "p-shell"}>
        <aside className="p-sidebar" aria-label="Portal navigation">
          <Link className="p-brand" href="/portal">
            <Image src="/logo.png" alt="ESKAY" width={1263} height={592} loading="eager" />
            <span>Partner portal</span>
          </Link>
          <div className="p-whoami">
            <strong>{session.user.name}</strong>
            <span>{ROLE_LABEL[session.user.role]}{session.user.state ? ` · ${session.user.state}` : ""}</span>
          </div>
          {!session.user.must_change_password && (
            <nav className="p-nav">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className={isActive(item) ? "active" : undefined} aria-current={isActive(item) ? "page" : undefined}>
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="p-sidebar-foot">
            {!session.user.must_change_password && <Link href="/portal/profile" className={pathname === "/portal/profile" ? "active" : undefined}>My profile</Link>}
            <button type="button" onClick={signOut}>Sign out</button>
          </div>
        </aside>

        {/* On small screens a tap outside the open drawer closes it. */}
        {menuOpen && <button type="button" className="p-scrim" aria-label="Close portal menu" onClick={() => setMenuOpenOn(null)} />}
        <div className="p-main">
          <div className="p-topbar">
            <Link className="p-topbar-brand" href="/portal"><Image src="/logo.png" alt="ESKAY" width={1263} height={592} /></Link>
            <button type="button" className="p-menu-btn" aria-expanded={menuOpen} aria-label="Toggle portal menu" onClick={() => setMenuOpenOn((current) => (current === pathname ? null : pathname))}>
              <span /><span /><span />
            </button>
          </div>
          <main className="p-content" id="content">
            {session.user.must_change_password ? <ForcePasswordChange /> : children}
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

// Every account starts with a password an admin generated and shared; it is replaced here before
// the rest of the portal opens. The API refuses other requests until this is done, too.
function ForcePasswordChange() {
  return (
    <div className="p-narrow">
      <header className="p-page-head">
        <div>
          <p className="p-eyebrow">Welcome</p>
          <h1>Set your own password</h1>
          <p className="p-lead">You signed in with a temporary password. Choose a new one to open the portal.</p>
        </div>
      </header>
      <PasswordForm firstTime />
    </div>
  );
}

export function PasswordForm({ firstTime = false }: { firstTime?: boolean }) {
  const session = useContext(SessionContext);
  const [state, setState] = useState({ busy: false, error: "", done: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("new_password"));
    if (next !== String(data.get("confirm_password"))) return setState({ busy: false, error: "The two new passwords do not match.", done: false });
    setState({ busy: true, error: "", done: false });
    try {
      const { user } = await api<{ user: User }>("/me/password", { method: "POST", body: { current_password: data.get("current_password"), new_password: next } });
      form.reset();
      setState({ busy: false, error: "", done: true });
      // Clearing must_change_password in the session is what lets the shell open the portal.
      session?.setUser(user);
    } catch (error) {
      setState({ busy: false, error: (error as Error).message, done: false });
    }
  }

  return (
    <form className="p-card p-form" onSubmit={submit}>
      {/* Lets password managers file the new password under the right account. */}
      <input type="text" name="username" autoComplete="username" value={session?.user.email ?? ""} readOnly hidden />
      <Field label={firstTime ? "Temporary password" : "Current password"} required>
        <input name="current_password" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint="At least 8 characters, with a letter and a number." required>
        <input name="new_password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" required>
        <input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.done && !firstTime && <Notice tone="success">Your password has been changed. Other devices have been signed out.</Notice>}
      <div className="p-form-actions">
        <button className="p-btn" type="submit" disabled={state.busy}>{state.busy ? "Saving…" : firstTime ? "Set password and continue" : "Change password"}</button>
      </div>
    </form>
  );
}
