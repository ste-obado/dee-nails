import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from core.config import settings
from database import SessionLocal
from routers import authentication, user, salon_services, bookings, schedule

# Schema is now owned by Alembic migrations (see alembic/), not created here.
# Run `alembic upgrade head` before starting the app for the first time,
# and after pulling any change that adds a new migration.

app = FastAPI(
    title="Dee Nails API",
    # hide interactive API docs in production — no reason to publish your
    # whole schema (including admin routes) to anyone who finds the URL
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_ORIGINS,  # set via FRONTEND_ORIGINS env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


# Local photo serving is retained for development only. Production photos live in R2.
if not settings.r2_enabled:
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "services"), exist_ok=True)
    from fastapi.staticfiles import StaticFiles
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(authentication.router)
app.include_router(user.router)
app.include_router(salon_services.router)
app.include_router(bookings.router)
app.include_router(schedule.router)


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    """Readiness check: verifies both the API process and database connection."""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    finally:
        db.close()
