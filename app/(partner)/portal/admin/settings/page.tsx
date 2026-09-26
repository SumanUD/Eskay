"use client";

import { useState } from "react";
import { api } from "../../../_lib/api";
import { RoleGate, useApi } from "../../../_lib/session";
import { Loading, Notice, PageHeader } from "../../../_lib/ui";

type Settings = { region_filter: "on" | "off" };

export default function AdminSettingsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <AdminSettings />
    </RoleGate>
  );
}

function AdminSettings() {
  const { data, error, loading, reload } = useApi<{ settings: Settings }>("/settings");
  const [state, setState] = useState<{ busy: boolean; tone?: "success" | "error"; text?: string }>({ busy: false });

  async function setRegionFilter(value: "on" | "off") {
    if (value === "on" && !window.confirm("Switch the regional catalogue on? Distributors and dealers will immediately see only the products flagged for their state.")) return;
    setState({ busy: true });
    try {
      await api("/settings", { method: "PATCH", body: { region_filter: value } });
      setState({ busy: false, tone: "success", text: `Regional catalogue switched ${value}.` });
      reload();
    } catch (failure) {
      setState({ busy: false, tone: "error", text: (failure as Error).message });
    }
  }

  const on = data?.settings.region_filter === "on";

  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <section className="p-card p-setting">
          <div>
            <h2 className="p-card-title">Regional catalogue</h2>
            <p className="p-plain">
              Every product carries a region flag: the states it is released in. While this is <strong>off</strong>, the flags are recorded but every
              distributor and dealer sees every active product. Switch it <strong>on</strong> and each partner sees only the products flagged for their
              own state; material linked to a product follows the same rule. Admins always see everything.
            </p>
            <p className="p-plain p-muted">Before switching on, check that every distributor and dealer has the right state, and every product the right flags.</p>
          </div>
          <div className="p-setting-control">
            <span className={on ? "p-badge is-ok" : "p-badge is-muted"}>{on ? "On" : "Off"}</span>
            <button type="button" className={on ? "p-btn is-ghost" : "p-btn"} disabled={state.busy} onClick={() => setRegionFilter(on ? "off" : "on")}>
              {on ? "Switch off" : "Switch on"}
            </button>
          </div>
        </section>
      )}
      {state.text && <Notice tone={state.tone}>{state.text}</Notice>}
    </>
  );
}
