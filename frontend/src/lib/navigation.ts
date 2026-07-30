/**
 * Full-document navigation (window.location), for URLs served by Django
 * rather than the Next app - e.g. django-allauth's /accounts/* SSO redirect
 * flow, which must leave the SPA. Lives in its own module so tests can mock
 * it: jsdom's Location members are unforgeable and cannot be spied on.
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
