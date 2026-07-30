import type { AuthConfig, AuthUser } from "@/lib/auth";

import { APPS, type AppDefinition } from "./registry";

/**
 * Which registry apps the current user may see. Mirrors the backend rules
 * (core/security.py AdminAuth/AppAccessAuth) - this filter is cosmetic UX;
 * the API is the security boundary:
 * - auth not required (config loaded, flag off) -> everything (open mode);
 * - not signed in -> nothing;
 * - staff -> everything (admins bypass grants and own the Admin Portal);
 * - otherwise -> non-adminOnly apps the user has been granted.
 */
export function visibleApps(
  user: AuthUser | null,
  config: AuthConfig | null,
): readonly AppDefinition[] {
  if (config && !config.auth_required) return APPS;
  if (!user) return [];
  if (user.is_staff) return APPS;
  return APPS.filter((app) => !app.adminOnly && user.app_ids.includes(app.id));
}
