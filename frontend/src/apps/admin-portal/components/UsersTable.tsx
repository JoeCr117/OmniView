"use client";

import { useCallback, useState } from "react";

import { APPS } from "@/apps/registry";
import { ErrorState } from "@/components/common/AsyncState";
import { Pager } from "@/components/common/Pager";
import { KpiCard } from "@/components/common/KpiCard";
import { RefreshBar } from "@/components/common/progress";
import { KpiSkeleton, TableSkeleton } from "@/components/common/skeletons";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/useResource";

import { getUsers, grantApp, revokeApp, setAdmin } from "../lib/api";

const PAGE_SIZE = 25;
const GRANTABLE_APPS = APPS.filter((app) => !app.adminOnly);

/**
 * The Users & Access executive dashboard: KPI cards + one row per user with
 * live grant/revoke switches per dashboard app and an Admin switch. Every
 * toggle writes immediately (optimistic reload on success, error banner on
 * failure).
 */
export function UsersTable() {
  const { user: me } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  // Debounced so typing "joseph" is one request after the pause, not six as
  // each keystroke landed (five of them thrown away).
  const debouncedQ = useDebouncedValue(q, 300);

  const { data, status, error, isValidating, refetch } = useResource(
    `admin-portal:users:${offset}:${debouncedQ}`,
    () => getUsers({ limit: PAGE_SIZE, offset, q: debouncedQ || undefined }),
  );

  const act = useCallback(
    (action: Promise<unknown>) => {
      setActionError(null);
      // Refetch the current page after a grant/revoke/admin change lands.
      action.then(() => refetch()).catch((e) => setActionError(String(e)));
    },
    [refetch],
  );

  if (status === "error") return <ErrorState message={String(error)} onRetry={refetch} />;
  if (status === "loading" || !data) {
    return (
      <div className="flex flex-col gap-6">
        <KpiSkeleton count={3} />
        <TableSkeleton rows={10} />
      </div>
    );
  }

  const admins = data.items.filter((u) => u.is_staff).length;
  const withAccess = data.items.filter((u) => u.is_staff || u.app_ids.length > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <RefreshBar active={isValidating} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total users" value={data.count} />
        <KpiCard label="Admins (this page)" value={admins} />
        <KpiCard label="With app access (this page)" value={withAccess} />
      </div>

      {actionError && (
        <p role="alert" className="text-destructive text-sm">
          Change failed: {actionError}
        </p>
      )}

      <Input
        placeholder="Filter by username or email…"
        value={q}
        onChange={(event) => {
          setOffset(0);
          setQ(event.target.value);
        }}
        className="max-w-sm"
        aria-label="Filter users"
      />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              {GRANTABLE_APPS.map((app) => (
                <th key={app.id} className="px-4 py-3 font-medium">
                  {app.name}
                </th>
              ))}
              <th className="px-4 py-3 font-medium">Admin</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((user) => (
              <tr key={user.id} className="border-t">
                <td className="px-4 py-3">
                  <span className="block font-medium">{user.username}</span>
                  <span className="block text-xs text-muted-foreground">
                    {user.email || "no email"}
                  </span>
                </td>
                {GRANTABLE_APPS.map((app) => {
                  const granted = user.app_ids.includes(app.id);
                  return (
                    <td key={app.id} className="px-4 py-3">
                      <Switch
                        checked={user.is_staff || granted}
                        disabled={user.is_staff}
                        aria-label={`${app.name} access for ${user.username}`}
                        title={user.is_staff ? "Admins always have access" : undefined}
                        onCheckedChange={(next) =>
                          act(next ? grantApp(user.id, app.id) : revokeApp(user.id, app.id))
                        }
                      />
                    </td>
                  );
                })}
                <td className="px-4 py-3">
                  <Switch
                    checked={user.is_staff}
                    disabled={user.username === me?.username}
                    aria-label={`Admin status for ${user.username}`}
                    title={
                      user.username === me?.username ? "You cannot demote yourself" : undefined
                    }
                    onCheckedChange={(next) => act(setAdmin(user.id, next))}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.last_login ? new Date(user.last_login).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager offset={offset} limit={PAGE_SIZE} count={data.count} onOffsetChange={setOffset} />
    </div>
  );
}
