"""
Test setup shared by every test file.

Uses SQLite + fakeredis instead of the real MySQL/Redis so the whole suite
runs in ~1 second with nothing to start up first. fakeredis implements the
real Redis command set (INCR, EXPIRE, TTL, etc.), so rate-limiting and
login-attempt logic get exercised faithfully, not just mocked into passing.

To run the same suite against your REAL MySQL + Redis (closer to what
production actually behaves like), see "Testing against real services" in
tests/README.md.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# must be set before any app module is imported, since core/config.py
# reads them at import time
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_run.db")
import tempfile
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp(prefix="dee_uploads_"))
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6379")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("FRONTEND_ORIGINS", "http://localhost:5173")

import fakeredis
import pytest

import redis_cache
redis_cache.redis_client = fakeredis.FakeRedis(decode_responses=True)

from database import Base, engine, SessionLocal
import models  # noqa: F401 — registers tables on Base.metadata
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    """Fresh schema once per test run, torn down at the end."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    db_file = os.environ["DATABASE_URL"].replace("sqlite:///", "")
    if os.path.exists(db_file):
        os.remove(db_file)


@pytest.fixture(autouse=True)
def _clear_redis():
    """Each test starts with a clean rate-limit/attempt-counter slate."""
    redis_cache.redis_client.flushall()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def register_and_login(client, email, role="user"):
    # /auth/register always creates a plain "user" now — role can't be
    # client-supplied (that was a real privilege-escalation bug). To get an
    # admin for tests, register normally, then promote directly via the DB,
    # the same way scripts/create_admin.py does for real accounts.
    client.post("/auth/register", json={
        "name": email.split("@")[0],
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
    })
    if role == "admin":
        db = SessionLocal()
        user = db.query(models.User).filter(models.User.email == email).first()
        user.role = models.UserRole.admin
        db.commit()
        db.close()

    r = client.post("/auth/login", data={"username": email, "password": "password123"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(client):
    # unique email per test — a shared account across tests would carry
    # over state between tests, defeating the point of an isolated test
    email = f"admin-{uuid.uuid4().hex[:8]}@test.com"
    return register_and_login(client, email, role="admin")


@pytest.fixture
def user_headers(client):
    email = f"customer-{uuid.uuid4().hex[:8]}@test.com"
    return register_and_login(client, email, role="user")
