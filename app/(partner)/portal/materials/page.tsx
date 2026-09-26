"use client";

import { MaterialList } from "../../_lib/catalogue";
import { RoleGate, useApi } from "../../_lib/session";
import type { Material } from "../../_lib/types";
import { EmptyState, Loading, Notice, PageHeader } from "../../_lib/ui";

export default function MaterialsPage() {
  return (
    <RoleGate roles={["admin", "distributor", "dealer"]}>
      <Materials />
    </RoleGate>
  );
}

function Materials() {
  const { data, error, loading } = useApi<{ materials: Material[] }>("/materials");
  return (
    <>
      <PageHeader eyebrow="Downloads" title="Downloadable material" description="Price lists, brochures and documents shared with your account." />
      {loading && <Loading />}
      {error && <Notice tone="error">{error}</Notice>}
      {data && (data.materials.length ? <MaterialList materials={data.materials} /> : <EmptyState title="Nothing to download yet">Material shared with your account will appear here.</EmptyState>)}
    </>
  );
}
