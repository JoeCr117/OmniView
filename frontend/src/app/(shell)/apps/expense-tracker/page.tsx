import Link from "next/link";

import { getApp } from "@/apps/registry";

/** ExpenseTracker landing page (the launcher normally deep-links past it). */
export default function ExpenseTrackerHome() {
  const app = getApp("expense-tracker");
  if (!app) return null;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
      <p className="mt-1 mb-4 text-muted-foreground">{app.description}</p>
      <ul className="space-y-1.5">
        {app.navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-primary underline-offset-4 hover:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
