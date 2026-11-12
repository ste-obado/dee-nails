# Dee Nails: customer site

The public booking site. Clients pick services, choose a free time, and send
the booking details to Dee on WhatsApp. No account or login needed.

## Local development

```bash
npm install
cp .env.example .env   # set VITE_API_URL to your backend
npm run dev            # http://localhost:5173
```

The backend must be running (see `../api`). Dee's WhatsApp
number and opening hours come from the backend (`GET /schedule/info`), so
there is nothing salon-specific to configure here.

## How a booking works

1. **Services** (`/`): `GET /services/`. A two-column photo grid with category tabs; the round button on a photo adds it to "My appointment".
   Tapping a service opens `/service/:id`: a swipeable gallery of up to four photos
   with a thumbnail strip, the full description, and an add button.
2. **My appointment** (`/book`): pick a day and time. Free times come from
   `GET /bookings/slots`; taken times are shown hatched.
3. **Book**: `POST /bookings/`. The server recalculates price and duration and
   re-checks the slot, so a time someone else just took is refused.
4. **Confirmation** (`/booked`): a button opens WhatsApp to Dee with the
   booking details prefilled. The booking is already saved before this step,
   so nothing is lost if WhatsApp is never opened.

5. **Check booking** (`/check`): `POST /bookings/lookup` with the reference and the
   phone number. Nothing private (phone, notes) is sent back, and a wrong phone
   and a wrong reference give the same answer.

In the browser (`localStorage`) we keep only the selected service IDs and, if the
client ticks "Remember my name and number", their name and phone. Prices always
come fresh from the server.

## Logo, icons and link preview

Everything is in `public/` (see the main README's Branding section). To show the
logo when the link is shared on WhatsApp, set `VITE_SITE_URL` to this site's public
address at build time.

## Deploying

```bash
npm run build   # outputs to dist/
```

Set `VITE_API_URL` to the deployed backend (and `VITE_SITE_URL` to this site's address), and add this site's domain to the
backend's `FRONTEND_ORIGINS`.
