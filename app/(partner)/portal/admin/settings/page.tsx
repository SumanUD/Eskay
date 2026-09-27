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
  const { data, error, loading, reload } = useApi<{ settings: Settings; email_enabled: boolean }>("/settings");
  const [state, setState] = useState<{ busy: boolean; tone?: "success" | "error"; text?: string }>({ busy: false });

  async function setRegionFilter(value: "on" | "off") {
    if (value === "on" && !window.confirm("Switch regional products on? Distributors and dealers will immediately see only the products released in their state.")) return;
    setState({ busy: true });
    try {
      await api("/settings", { method: "PATCH", body: { region_filter: value } });
      setState({ busy: false, tone: "success", text: `Regional products switched ${value}.` });
      reload();
    } catch (failure) {
      setState({ busy: false, tone: "error", text: (failure as Error).message });
    }
  }

  const on = data?.settings.region_filter === "on";

  return (
    <>
      <PageHeader title="Settings" />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <section className="p-card p-setting">
          <div>
            <h2 className="p-card-title">Regional products</h2>
            <p className="p-plain">
              Every product records the states it is released in. While this is <strong>off</strong>, that region is recorded but every
              distributor and dealer sees every active product. Switch it <strong>on</strong> and each partner sees only the products released in their
              own state; material linked to a product follows the same rule. Admins always see everything.
            </p>
            <p className="p-plain p-muted">Before switching on, check that every distributor and dealer has the right state, and every product the right region.</p>
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
      {data && (
        <section className="p-card p-setting">
          <div>
            <h2 className="p-card-title">Email notifications</h2>
            <p className="p-plain">
              The portal emails partners when their account is created or their password is reset, tells a distributor and dealer when they are
              linked to each other, and lets partners know when new material or a scheme is shared with them.
            </p>
          </div>
          <div className="p-setting-control">
            <span className={data.email_enabled ? "p-badge is-ok" : "p-badge is-warn"}>{data.email_enabled ? "Sending" : "Not configured"}</span>
          </div>
        </section>
      )}
    </>
  );
}
