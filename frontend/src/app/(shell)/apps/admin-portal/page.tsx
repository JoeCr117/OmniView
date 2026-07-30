import Link from "next/link";

import { getApp } from "@/apps/registry";

/** Landing fallback for /apps/admin-portal - the launcher deep-links to
 * basePath (overview), but direct visits get the tab list. */
export default function AdminPortalHome() {
  const app = getApp("admin-portal");
  if (!app) return null;
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{app.name}</h1>
      <ul className="flex flex-col gap-2">
        {app.navItems.map((item) => (
          <li key={item.href}>
            <Link className="text-primary underline-offset-4 hover:underline" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
