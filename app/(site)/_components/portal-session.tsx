"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, getToken, SIGNED_OUT_EVENT } from "../../(partner)/_lib/api";
import type { User } from "../../(partner)/_lib/types";
import { Arrow } from "./icons";

type PortalUser = { name: string };

// A per-tab copy of who is signed in, so moving between pages does not flash the signed-out state
// while the API is asked again.
const CACHE_KEY = "eskay.portal.who";
const readCache = (): PortalUser | null => {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
};
const writeCache = (user: PortalUser | null) => {
  try {
    if (user) sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Without storage the name is simply fetched again on the next page.
  }
};

// The header, menu and footer all ask at once, so they share one request per session token.
let lookup: { token: string; result: Promise<PortalUser | null | undefined> } | null = null;
function whoIsSignedIn(token: string) {
  if (lookup?.token !== token) {
    lookup = {
      token,
      result: api<{ user: User }>("/me").then(
        ({ user }) => ({ name: user.name }),
        // An expired session signs out; anything else (offline, say) leaves it as it was.
        (error: ApiError) => (error.status === 401 ? null : undefined),
      ),
    };
  }
  return lookup.result;
}

/**
 * The partner signed in to the portal in this browser, or null. The public site only reads the
 * session; signing in and out happens in the portal.
 */
export function usePortalUser() {
  const [user, setUser] = useState<PortalUser | null>(null);

  useEffect(() => {
    const signedOut = () => {
      writeCache(null);
      setUser(null);
    };
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);
    const token = getToken();
    if (!token) {
      signedOut();
      return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
    }

    let live = true;
    setUser(readCache() ?? { name: "" });
    whoIsSignedIn(token).then((who) => {
      if (!live || who === undefined) return;
      if (who === null) return signedOut();
      writeCache(who);
      setUser(who);
    });
    return () => {
      live = false;
      window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
    };
  }, []);

  return user;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export type { PortalUser };

/** Header chip shown while a partner is signed in. */
export function PortalChip({ user }: { user: PortalUser | null }) {
  if (!user) return null;
  return (
    <Link className="portal-chip" href="/portal" aria-label={user.name ? `My portal, signed in as ${user.name}` : "My portal"} title={user.name ? `Signed in as ${user.name}. Open the partner portal` : "Open the partner portal"}>
      <span className="portal-chip-avatar" aria-hidden="true">{user.name ? initials(user.name) : "✓"}</span>
      <span className="portal-chip-text">My portal</span>
    </Link>
  );
}

/** The menu's partner link: sign in, or go back to the portal when already signed in. */
export function MenuPartnerLink({ user, onNavigate }: { user: PortalUser | null; onNavigate: () => void }) {
  return user ? (
    <Link className="menu-partner" href="/portal" onClick={onNavigate}>{user.name ? `Signed in as ${user.name}.` : "You are signed in."} <strong>Go to your partner portal</strong><Arrow /></Link>
  ) : (
    <Link className="menu-partner" href="/login" onClick={onNavigate}>Registered partner? <strong>Sign in to the partner portal</strong><Arrow /></Link>
  );
}

/** The footer's partner link. */
export function FooterPartnerLink() {
  const user = usePortalUser();
  return user ? <Link href="/portal">My partner portal <Arrow /></Link> : <Link href="/login">Partner login <Arrow /></Link>;
}
