"use client";

import { RoleGate, useApi } from "../../_lib/session";
import type { Contact } from "../../_lib/types";
import { ContactTable, EmptyState, Loading, Notice, PageHeader } from "../../_lib/ui";

export default function DealersPage() {
  return (
    <RoleGate roles={["distributor"]}>
      <Dealers />
    </RoleGate>
  );
}

function Dealers() {
  const { data, error, loading } = useApi<{ dealers: Contact[] }>("/my/dealers");
  return (
    <>
      <PageHeader eyebrow="My network" title="Assigned dealers" description="Dealers that ESKAY has assigned to you." />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (data.dealers.length ? <ContactTable contacts={data.dealers} /> : <EmptyState title="No dealers assigned yet">When ESKAY assigns dealers to you, their details will appear here.</EmptyState>)}
    </>
  );
}
