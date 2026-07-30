"use client";

import Link from "next/link";

import { visibleApps } from "@/apps/access";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

/**
 * OmniView home: the app launcher. One card per app the current user may
 * see (deny-by-default - src/apps/access.ts); clicking a card opens that
 * app inside the dashboard viewport. Client component: visibility depends
 * on the signed-in user, which a static export can't know at build time.
 */
export default function Home() {
  const { user, config, loading } = useAuth();
  const apps = visibleApps(user, config);

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to OmniView</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Pick an app to get started.</p>
      {loading ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="launcher-skeleton"
        >
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      ) : apps.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          No apps have been granted to you yet — contact an administrator.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={app.basePath}
              className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
                <CardHeader>
                  <app.icon className="mb-2 size-8 text-primary" aria-hidden />
                  <CardTitle>{app.name}</CardTitle>
                  <CardDescription>{app.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
