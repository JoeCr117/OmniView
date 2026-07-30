"""OmniView's dashboard apps.

One subpackage per app id in frontend/src/apps/registry.ts. Everything an app
owns - its Django apps, API routers, services and tests - lives under its
subpackage; the shell (backend/shell/) owns what is common to all of them.
Adding one is a fixed checklist: see docs/ARCHITECTURE.md.
"""
