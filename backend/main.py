# ASGI entrypoint shim.
#
# Railway's start command runs `uvicorn main:app`, but the FastAPI application
# is defined in server.py. This module re-exports it so `main:app` resolves
# correctly. Importing server.py only wires up routers and defines `app` —
# seed_data() runs inside the lifespan handler, not at import time.
from server import app

__all__ = ["app"]
