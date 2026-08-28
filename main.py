"""ASGI entrypoint for running the app as `uvicorn main:app`."""
from __future__ import annotations

import importlib.util
import os
import sys


ROOT_DIR = os.path.dirname(__file__)
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
BACKEND_MAIN = os.path.join(BACKEND_DIR, "main.py")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

_spec = importlib.util.spec_from_file_location("backend_main", BACKEND_MAIN)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"Could not load backend entrypoint from {BACKEND_MAIN}")

_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

app = _module.app
