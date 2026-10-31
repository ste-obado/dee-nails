# Running the tests

```bash
npm install
npm test
```

Covers the admin-role gate on login (correctly rejects a customer account,
correctly surfaces the backend's error message on bad credentials), the
schedule page (booking order, confirm / cancel / reschedule and the WhatsApp
link each returns, clash errors, cancelled filter, time off, week view) and
the WhatsApp number cleanup, using a mocked API client — no backend needs to
be running for these.

## Manual QA before each deploy

Automated tests don't cover everything yet. Before shipping a change, walk
through by hand:

- [ ] Log in with a real admin account, real backend
- [ ] Log in with a real customer account → confirm it's rejected, not just in tests
- [ ] Book a test appointment on the customer site, confirm it shows under Schedule for that day
- [ ] Confirm it, tap "Message on WhatsApp", check the typed message is right
- [ ] Reschedule it, then cancel it with a reason; check both WhatsApp messages
- [ ] Block a lunch hour, then check that time shows hatched on the customer site
- [ ] Change opening hours and check the customer site's day strip and time grid follow
- [ ] Add, edit, hide and show a service
- [ ] Change the WhatsApp number in Settings and check a new booking's link uses it
- [ ] Log out, confirm the token is actually invalidated (try the back button)
