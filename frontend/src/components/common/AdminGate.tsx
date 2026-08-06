"use client";

import { canSeeAdminOnly } from "@/apps/access";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

/**
 * Client-side gate around a staff-only page: staff (or open mode) pass,
 * everyone else gets a clear denial. Cosmetic only - the API's AdminAuth is
 * the security boundary. Do not assume a Django page-level 404 sits behind
 * this; whether one does depends on the route.
 *
 * Cross-app, and therefore here: it wraps every Admin Portal page and
 * Omni-ERD's Relationships tab.
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
  if (!canSeeAdminOnly(user, config)) {
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
