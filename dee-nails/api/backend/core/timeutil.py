"""
Salon-local time helpers.

Bookings are stored as plain local times ("12:00 on 31 Oct") with no timezone
attached. Dee and her clients all live in one timezone, so this keeps every
comparison simple and avoids the classic bug where a booking shifts by three
hours between the database, the server and the browser.

The only time we need a timezone is "what time is it at the salon right now?"
(for the minimum-notice rule) -- that's now_local().
"""
from datetime import datetime, timedelta, timezone

from core.config import settings

SALON_TZ = timezone(timedelta(hours=settings.SALON_UTC_OFFSET_HOURS))


def now_local() -> datetime:
    """Current salon time as a naive datetime."""
    return datetime.now(SALON_TZ).replace(tzinfo=None)


def to_local_naive(dt: datetime) -> datetime:
    """
    Accept what the frontend sends and return naive salon-local time with
    seconds dropped. A naive value is taken as already local; a timezone-aware
    one (e.g. ending in Z or +03:00) is converted to salon time first.
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(SALON_TZ).replace(tzinfo=None)
    return dt.replace(second=0, microsecond=0)
