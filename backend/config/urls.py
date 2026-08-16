"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from .api import api
from .frontend import frontend_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
    # django-allauth server-side redirect flow (Microsoft Entra ID, M7):
    # /accounts/microsoft/login/ starts the OAuth round-trip,
    # /accounts/microsoft/login/callback/ completes it. Must sit above the
    # catch-all or the SPA would swallow the callback.
    path('accounts/', include('allauth.urls')),
    # django.contrib.staticfiles only auto-serves STATIC_URL under `manage.py
    # runserver` (and only when DEBUG=True) - under gunicorn (how the Docker
    # image runs) nothing serves /static/ without an explicit route, which
    # silently 404'd Django Ninja's own Swagger UI assets (swagger-ui.css/js),
    # rendering /api/docs as a blank page. Mirrors frontend_view's use of the
    # same always-on django.views.static.serve for the Next.js export.
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
    # Catch-all: serve the Next.js static export for everything else.
    # Must stay last so /admin/, /api/, and /static/ are matched first.
    re_path(r'^(?P<resource>.*)$', frontend_view),
]
