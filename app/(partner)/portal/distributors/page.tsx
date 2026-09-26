"use client";

import { RoleGate, useApi } from "../../_lib/session";
import type { Contact } from "../../_lib/types";
import { ContactTable, EmptyState, Loading, Notice, PageHeader } from "../../_lib/ui";

export default function DistributorsPage() {
  return (
    <RoleGate roles={["sales"]}>
      <Distributors />
    </RoleGate>
  );
}

function Distributors() {
  const { data, error, loading } = useApi<{ distributors: Contact[] }>("/my/distributors");
  return (
    <>
      <PageHeader eyebrow="My area" title="My distributors" description="Distributors assigned to you, and where their orders stand." />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (data.distributors.length ? <ContactTable contacts={data.distributors} orders /> : <EmptyState title="No distributors assigned yet">When ESKAY assigns distributors to you, they will appear here with their orders.</EmptyState>)}
    </>
  );
}
