"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { Role, User } from "./types";

type Session = { user: User; setUser: (user: User) => void; signOut: () => Promise<void> };

export const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside the portal shell");
  return session;
}

/** Loads `path` from the API and re-fetches it on `reload()`. Pass `null` to skip loading. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: path !== null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let live = true;
    api<T>(path).then(
      (data) => live && setState({ data, loading: false }),
      (error: Error) => live && setState({ error: error.message, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return { ...state, reload };
}

/** Renders its children only for the listed roles. The API enforces the same rule regardless. */
export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useSession();
  if (!roles.includes(user.role)) {
    return (
      <div className="p-empty">
        <h2>Not available for your account</h2>
        <p>This part of the portal is not part of your account&apos;s access. Use the menu to find what is.</p>
      </div>
    );
  }
  return <>{children}</>;
}
