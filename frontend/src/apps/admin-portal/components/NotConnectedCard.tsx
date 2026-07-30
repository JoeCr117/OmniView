import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/http";

/**
 * Shared empty states for the Databricks-backed dashboards (Jobs/Costs):
 * 503 = the backend has no workspace credentials at all; 403 = the app is
 * missing a user-authorization scope or the user hasn't consented yet.
 * Anything else falls through to the caller's generic error state.
 */
export function describeDatabricksError(error: unknown): "not_connected" | "missing_scope" | null {
  if (error instanceof ApiError) {
    if (error.status === 503) return "not_connected";
    if (error.status === 403) return "missing_scope";
  }
  return null;
}

export function NotConnectedCard({ kind }: { kind: "not_connected" | "missing_scope" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {kind === "not_connected" ? "Databricks not connected" : "Additional authorization needed"}
        </CardTitle>
        <CardDescription>
          {kind === "not_connected"
            ? "This deployment has no Databricks credentials available, so live workspace data can't be shown here."
            : "Databricks denied the request. The app may be missing a user authorization scope, or your one-time consent is still pending — reopen the app from the workspace to re-consent."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
