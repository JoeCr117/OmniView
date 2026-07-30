"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

/**
 * Client-side gate around every Admin Portal page: staff (or open mode)
 * pass, everyone else gets a clear denial. Cosmetic only - the API's
 * AdminAuth and the backend page gate are the security boundary.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, config, loading } = useAuth();

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6" data-testid="admin-gate-skeleton">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-40 w-full rounded-xl" />
      </main>
    );
  }
  const openMode = config !== null && !config.auth_required;
  if (!openMode && !user?.is_staff) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <p role="alert" className="text-destructive">
          Admin access required — this area is only available to OmniView administrators.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
