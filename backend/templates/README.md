# backend/templates/

## Purpose
Django template overrides. The app is a static-export SPA, so there are almost no
server-rendered pages — this holds the handful of framework templates OmniView
customizes.

## Role in OmniView
Django's template loader picks these up ahead of the packaged defaults. Today the
only override targets django-ninja's API docs page.

## Contents
| Item | What it does |
|------|--------------|
| `ninja/` | Overrides for django-ninja's built-in templates (the Swagger docs page). |

## Conventions & gotchas
- Keep this minimal: OmniView's UI is the Next.js export, not Django templates.
  A new template here should be a deliberate framework override, not app UI.

## See also
- [backend/](../README.md) · [ninja/](ninja/README.md)
