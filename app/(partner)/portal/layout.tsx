import { PortalShell } from "../_lib/shell";

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PortalShell>{children}</PortalShell>;
}
