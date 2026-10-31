"""
The slot engine: pure functions, no database, no FastAPI.

Keeping the maths separate from the database means it can be tested with
plain datetimes, and the exact same rule is used both to *show* free slots
and to *re-check* a slot at the moment someone books it.

Mental model: each booking occupies a block on Dee's timeline,
[start, end + buffer). A new booking fits only if its own block doesn't
overlap any existing block or any time Dee has blocked off.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Iterable, Optional


@dataclass(frozen=True)
class Interval:
    start: datetime
    end: datetime


def has_conflict(
    start: datetime,
    end: datetime,
    bookings: Iterable[Interval],
    blocks: Iterable[Interval],
    buffer_minutes: int,
) -> bool:
    """True if [start, end) collides with a booking (plus buffer) or a blocked period."""
    buf = timedelta(minutes=buffer_minutes)
    for b in bookings:
        # two blocks overlap when each one starts before the other ends.
        # Back-to-back is fine: ending at 13:00 and starting at 13:00 is not a clash.
        if start < b.end + buf and b.start < end + buf:
            return True
    for k in blocks:
        if start < k.end and k.start < end:
            return True
    return False


def compute_free_slots(
    day: date,
    duration_minutes: int,
    hours,                      # WorkingHours row for that weekday (or None)
    settings,                   # SalonSettings row
    bookings: Iterable[Interval],
    blocks: Iterable[Interval],
    now: datetime,
) -> list[datetime]:
    """All start times on `day` where a booking of `duration_minutes` fits."""
    if hours is None or not hours.is_open:
        return []

    today = now.date()
    if day < today or day > today + timedelta(days=settings.max_days_ahead):
        return []

    bookings = list(bookings)
    blocks = list(blocks)

    open_dt = datetime.combine(day, hours.open_time)
    close_dt = datetime.combine(day, hours.close_time)
    earliest = now + timedelta(minutes=settings.min_notice_minutes)
    step = timedelta(minutes=settings.slot_interval_minutes)
    duration = timedelta(minutes=duration_minutes)

    slots = []
    t = open_dt
    # the whole service must finish by closing time, not just start before it
    while t + duration <= close_dt:
        if t >= earliest and not has_conflict(
            t, t + duration, bookings, blocks, settings.buffer_minutes
        ):
            slots.append(t)
        t += step
    return slots
