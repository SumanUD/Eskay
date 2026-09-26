"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { api, getToken, setToken } from "../_lib/api";
import { Icon } from "../_lib/icons";
import type { User } from "../_lib/types";
import { Field, Notice } from "../_lib/ui";

// `useSearchParams` needs a Suspense boundary for this page to be prerendered.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  );
}

// Only return to a portal page after sign-in, never to an arbitrary or external address.
function safeDestination(next: string | null) {
  return next && next.startsWith("/portal") && !next.startsWith("//") ? next : "/portal";
}

function SignIn() {
  const router = useRouter();
  const destination = safeDestination(useSearchParams().get("next"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace(destination);
  }, [router, destination]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { token } = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email: data.get("email"), password: data.get("password") },
      });
      setToken(token);
      router.replace(destination);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="p-login">
      <section className="p-login-brand">
        <Link href="/" className="p-login-logo"><Image src="/logo.png" alt="ESKAY" width={1263} height={592} loading="eager" /></Link>
        <div>
          <p className="p-eyebrow">Partner portal</p>
          <h1>Access for registered ESKAY partners.</h1>
          <p>Distributors, dealers and the ESKAY team sign in here for the catalogue, pricing, schemes, orders and downloadable material.</p>
        </div>
        <p className="p-login-note">Accounts are created by ESKAY. If you are a registered partner without a login, please contact your ESKAY representative.</p>
      </section>

      <section className="p-login-panel">
        <form className="p-login-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <Field label="Email" required>
            <input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password" required>
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <button className="p-btn is-block" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <Link className="p-back" href="/"><Icon name="back" />Back to eskaylife.com</Link>
        </form>
      </section>
    </div>
  );
}
