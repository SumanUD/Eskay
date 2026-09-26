"use client";

import { schemePeriod } from "../../_lib/format";
import { RoleGate, useApi } from "../../_lib/session";
import type { Scheme } from "../../_lib/types";
import { EmptyState, Loading, Notice, PageHeader } from "../../_lib/ui";

export default function SchemesPage() {
  return (
    <RoleGate roles={["admin", "distributor", "dealer"]}>
      <Schemes />
    </RoleGate>
  );
}

function Schemes() {
  const { data, error, loading } = useApi<{ schemes: Scheme[] }>("/schemes");
  return (
    <>
      <PageHeader eyebrow="Schemes" title="Current schemes" description="Trade schemes available to your account, including those starting soon." />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.schemes.length && <EmptyState title="No schemes running">New schemes will be listed here as soon as ESKAY publishes them.</EmptyState>}
      <div className="p-scheme-grid">
        {data?.schemes.map((scheme) => (
          <article className="p-card p-scheme" key={scheme.id}>
            <div className="p-scheme-head">
              <span className={`p-badge scheme-${scheme.status}`}>{scheme.status === "upcoming" ? "Starting soon" : scheme.status === "expired" ? "Ended" : "Running now"}</span>
              <small>{schemePeriod(scheme)}</small>
            </div>
            <h3>{scheme.title}</h3>
            {scheme.description && <p>{scheme.description}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
