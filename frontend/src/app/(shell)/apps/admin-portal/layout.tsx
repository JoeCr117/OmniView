import { AdminGate } from "@/apps/admin-portal/components/AdminGate";
import { AppSubnav } from "@/components/shell/AppSubnav";

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSubnav appId="admin-portal" />
      <AdminGate>{children}</AdminGate>
    </>
  );
}
