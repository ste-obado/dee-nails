# Backend tests

## Running the suite (fast — no setup needed)

```bash
pip install -r requirements-dev.txt
pytest
```

This uses SQLite + fakeredis instead of your real MySQL/Redis, so it runs
in a few seconds with nothing to start up first. fakeredis implements the
actual Redis command set, so rate-limiting/login-attempt logic is exercised
for real, not stubbed out.

## Testing against real MySQL + Redis

Closer to production behavior — worth doing before a deploy, not for every
change during development.

```bash
docker compose up -d mysql redis   # just the two dependencies, not the backend

# point the test run at them instead of SQLite/fakeredis
DATABASE_URL=mysql+pymysql://store_user:yourpassword@localhost:3306/store \
REDIS_HOST=localhost \
REDIS_PORT=6379 \
pytest
```

Two things change automatically when you do this: the app talks to a real
MySQL server (so real column types, real constraints, real enum behavior
get tested, not SQLite's more permissive versions of them), and rate limits
persist in an actual Redis instance rather than an in-memory fake.

## What's covered

- `test_auth.py` — register, duplicate email rejection, login success/failure, logout blacklisting a token
- `test_booking.py` — the booking engine: slot maths and clash detection, working hours and time off, the WhatsApp links, confirm / cancel / reschedule, price and duration computed on the server, per-phone limits, admin-only guards
- `test_security.py` — rate limiting, CORS, security headers

## What's NOT covered yet

- The actual M-Pesa STK push call (`payments_service.stk_push`) isn't tested end-to-end since it calls Safaricom's real API — that needs sandbox credentials and is better tested manually against the sandbox once you have them, not mocked into a false sense of confidence.
- Reviews (straightforward CRUD, lower risk — add tests here following the same pattern if you want full coverage).
