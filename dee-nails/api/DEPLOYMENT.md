# Deployment

## Local development (no Docker)

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # fill in real values (DATABASE_URL, SECRET_KEY, ...)
alembic upgrade head      # creates all tables
uvicorn main:app --reload
```

You need MySQL and Redis running locally (or just use the Docker route below).

Whenever you change a model in `models.py`:

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Always read the generated migration before applying it. Autogenerate won't
detect a plain column rename, for example; it sees "drop one column, add another".

## The old store tables

Dee Nails started life as an online store. The last migration
(`145ad41c969f_drop_old_store_tables.py`) **permanently deletes** the old
store tables (products, categories, carts, orders, payments, reviews) and
everything in them. On a new database that does nothing to worry about. If you
are upgrading a database that holds store data you want to keep, back it up
first, or delete that migration file before running `alembic upgrade head`.

## Creating Dee's admin account

`/auth/register` only creates plain customer accounts, never admins. Create
the admin from the server:

```bash
cd backend
python -m scripts.create_admin
```

It asks for an email, name and password and writes straight to the database.
Run it once after the first deploy, then log in to the admin site with it.

## WhatsApp number

Booking details are sent to the number in `WHATSAPP_NUMBER` (digits only,
country code first, for example `254702839214`). It is read once, the first
time the app starts. After that Dee changes it in the admin site under
Settings, and the `.env` value is ignored.

## Docker (backend + MySQL + Redis together)

```bash
cp .env.example .env    # fill in real values: passwords, SECRET_KEY, WhatsApp number
docker compose up --build
```

This starts all three services. The backend container runs
`alembic upgrade head` before starting the API (see the Dockerfile `CMD`), so
the schema always matches the code. The API is at `http://localhost:8000`.

## Going to a real server

- Put a reverse proxy (Nginx or Caddy) in front of the `backend` container
  for HTTPS. The app doesn't terminate TLS itself.
- Set `ENVIRONMENT=production`. This hides `/docs`, `/redoc` and
  `/openapi.json`, and turns on the HSTS header.
- Set `FRONTEND_ORIGINS` to the real domains of the booking site and the
  admin site, or the browser will block their requests.
- Build the two sites with `VITE_API_URL` pointing at the API, and upload each
  `dist/` folder to a static host (Netlify, Vercel, Cloudflare Pages, or Nginx).
- Back up the `mysql_data` volume (bookings) and the `uploads_data` volume
  (service photos) regularly. Losing a container is fine, losing a volume isn't.
