import { OverridesView } from "@/apps/omni-erd/components/OverridesView";
import { AdminGate } from "@/components/common/AdminGate";

export default function RelationshipsPage() {
  return (
    <AdminGate>
      <OverridesView />
    </AdminGate>
  );
}
