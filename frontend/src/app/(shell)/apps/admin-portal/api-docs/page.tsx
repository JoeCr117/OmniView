"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Embeds the Django-served Swagger UI (/api/docs) inside the app shell so it
 * gets the shared chrome. Same-origin, so no sandbox/CSP concerns. The
 * ?theme= param pins the overridden ninja/swagger.html template
 * (backend/templates/) to the dashboard's theme toggle; the iframe only
 * mounts client-side so the initial load already carries the right theme.
 */
export default function ApiDocsPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main style={{ flex: 1, display: "flex" }}>
      {mounted && (
        <iframe
          src={`/api/docs?theme=${resolvedTheme === "dark" ? "dark" : "light"}`}
          title="OmniView API documentation (Swagger UI)"
          style={{ flex: 1, border: "none", minHeight: "calc(100vh - 54px)" }}
        />
      )}
    </main>
  );
}
