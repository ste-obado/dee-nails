# Dee Nails admin

Dee's panel for managing bookings, services, opening hours and time off.
It's a standalone admin panel — separate app, separate bundle, separate deploy
from the customer booking site. It talks to the same backend API, but
because it's built and shipped independently, none of this code (routes,
components, or even the *existence* of an admin panel) ever reaches a
customer's browser.

## What's in it

- **Schedule** (`/`): day and week view of who booked and when. Confirm, mark
  done, mark no-show, reschedule or cancel. Confirm, cancel and reschedule show
  a "Message on WhatsApp" button that opens a chat to the client with the
  message already typed. Time off shows between bookings.
- **Services** (`/services`): add, edit, hide and show services (price, how
  long they take, category, description).
- **Hours and time off** (`/availability`): weekly opening hours, and blocked
  time (lunch, a day off, a holiday). If a block covers an existing booking,
  you're warned and the booking stays until you move or cancel it.
- **Settings** (`/settings`): Dee's WhatsApp number, the gap after each
  booking, the earliest a client can book, the time between start times, and
  how far ahead clients can book.

## Local development

```bash
npm install
cp .env.example .env   # then set VITE_API_URL to your backend
npm run dev             # runs on http://localhost:5174
```

## Deploying separately from the customer site

Build it:

```bash
npm run build   # outputs static files to dist/
```

Deploy `dist/` to its own subdomain — e.g. `admin.yourstore.com` — as a
separate static site (Netlify, Vercel, Cloudflare Pages, or a small Nginx
container). Point the customer storefront at `yourstore.com` and this at
`admin.yourstore.com`; both call the same backend API, just with different
`VITE_API_URL` builds if your API is also split by environment.

For extra protection beyond the app-level admin-role check, consider:
- Restricting the admin subdomain to a VPN or IP allowlist at the DNS/proxy
  level, if only staff should ever reach it at all.
- Basic auth in front of it (defense in depth — the app already enforces
  the real check via the API's `role` field).

## How access control works here

Logging in only proves valid credentials — it says nothing about role,
since customers and admins authenticate against the same `/auth/login`
endpoint. So after login (and on every protected route load), this app
calls `/users/me` and checks `role === "admin"` before rendering anything.
A customer token gets bounced straight back to `/login`. The backend's own
`require_admin` dependency is still the real enforcement — this check just
keeps a non-admin from seeing the admin UI at all.
