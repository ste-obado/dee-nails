# Dee Nails

A booking system for a one-person nail salon. Clients pick their services and
a free time on the website, and the booking details go to Dee on WhatsApp. Dee
manages everything from a separate admin site.

```
api/            FastAPI + MySQL + Redis backend (bookings, slots, WhatsApp links)
customer-site/  React site clients use to book (no login)
admin-site/     React site Dee uses (login required)
```

## How a booking works

1. The client browses the services (photos, prices, durations), adds some, then picks a day and time. Taken times are shown hatched. Their name and phone are remembered on that phone for next time.
2. The server recalculates the price and duration, re-checks the time is still
   free, and saves the booking as **pending**.
3. The client taps a button that opens WhatsApp to Dee with the details typed in.
4. Dee sees it on her Schedule, taps **Confirm**, and a WhatsApp message to the
   client is one tap away. Cancel and reschedule work the same way.

The booking is saved before WhatsApp opens, so nothing is lost if the client
never sends the message. Later, the client can open **Check booking** and enter
their reference and phone to see whether Dee has confirmed.

Dee adds a photo to each service from her phone's gallery or camera in the admin
site (Services). Photos are resized and stored on the server.

## Run it locally

```bash
# 1. backend (needs MySQL and Redis; easiest is Docker)
cd api
cp .env.example .env            # set the passwords and SECRET_KEY
docker compose up --build       # API on http://localhost:8000

# 2. Dee's admin account (once)
docker compose exec backend python -m scripts.create_admin

# 3. booking site
cd ../customer-site
npm install && cp .env.example .env && npm run dev     # http://localhost:5173

# 4. admin site
cd ../admin-site
npm install && cp .env.example .env && npm run dev     # http://localhost:5174
```

Then log in to the admin site, add Dee's services under **Services**, and check
her opening hours under **Hours and time off**.

Without Docker, see `api/DEPLOYMENT.md`.

## Running the tests

```bash
cd api/backend && pip install -r requirements-dev.txt && pytest   # 76 tests
cd admin-site && npm install && npm test                          # 29 tests
```

## Good to know

- **Old store tables:** the last database migration permanently deletes the
  tables from the earlier online-store version of this project. Read the
  "old store tables" section of `api/DEPLOYMENT.md` before upgrading an
  existing database.
- **Photos** live in the `uploads_data` Docker volume. Back it up along with the database.
- **Times** are salon-local (Kenya, UTC+3). There is no timezone conversion
  anywhere, so a 12:00 booking is 12:00 everywhere.
- **WhatsApp** links need no WhatsApp Business account or API. The number is set
  in `.env` the first time and in the admin site's Settings after that.
- **Heads-up:** the admin Schedule can show a reminder of today's or tomorrow's
  appointments (only when there are some). It is switched on and off in Settings.
- **Deploying:** see `api/DEPLOYMENT.md`. Each site builds to a static `dist/`
  folder with `npm run build`.
