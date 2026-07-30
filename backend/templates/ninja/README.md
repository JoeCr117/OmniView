# backend/templates/ninja/

## Purpose
Overrides django-ninja's built-in templates. Currently just the Swagger UI shell
for the auto-generated API docs.

## Role in OmniView
django-ninja renders its interactive docs from a packaged template; dropping a
same-named file here replaces it, letting OmniView control the docs page (e.g.
which OpenAPI/Swagger assets it loads) without forking the library.

## Contents
| Item | What it does |
|------|--------------|
| `swagger.html` | The Swagger UI page served for the ninja API docs. |

## Conventions & gotchas
- The filename must match ninja's template name exactly, or the override is
  silently ignored and the packaged default is used.

## See also
- [templates/](../README.md) · [config/api.py](../../config/README.md) (builds the NinjaAPI)
