from datetime import datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.config import settings as app_settings
from models import Booking, BookingStatus, BlockedTime, SalonSettings, WorkingHours

ACTIVE_STATUSES = (BookingStatus.pending, BookingStatus.confirmed)

# Monday-Saturday 09:00-18:00, Sunday closed. Dee can change all of it.
DEFAULT_HOURS = {
    0: (True, time(9, 0), time(18, 0)),
    1: (True, time(9, 0), time(18, 0)),
    2: (True, time(9, 0), time(18, 0)),
    3: (True, time(9, 0), time(18, 0)),
    4: (True, time(9, 0), time(18, 0)),
    5: (True, time(9, 0), time(18, 0)),
    6: (False, time(9, 0), time(18, 0)),
}


def ensure_defaults(db: Session) -> None:
    """Create the settings row and the 7 working-hours rows the first time they're needed."""
    try:
        if db.query(SalonSettings).filter(SalonSettings.id == 1).first() is None:
            db.add(SalonSettings(id=1, whatsapp_number=app_settings.WHATSAPP_NUMBER))
        have = {w.weekday for w in db.query(WorkingHours).all()}
        for weekday, (is_open, open_t, close_t) in DEFAULT_HOURS.items():
            if weekday not in have:
                db.add(WorkingHours(weekday=weekday, is_open=is_open, open_time=open_t, close_time=close_t))
        db.commit()
    except IntegrityError:
        # two first requests raced to create the defaults; the other one won
        db.rollback()
    # always end the transaction here (even when nothing was inserted):
    # acquire_schedule_lock() below must be the FIRST statement of a fresh
    # transaction so its snapshot is taken after the lock is held.
    db.commit()


def acquire_schedule_lock(db: Session) -> SalonSettings:
    """
    Serialise everything that changes the calendar.

    Two clients can both see 12:00 as free and press "Book" at the same instant.
    A unique constraint can't stop that (an overlap isn't a duplicate), so every
    write that could create a clash first takes a database lock on the single
    settings row -- like one key to the salon door: whoever holds it checks the
    calendar and writes the booking, and the next person only checks afterwards,
    seeing the first booking.
    The lock is released automatically on commit/rollback.
    """
    ensure_defaults(db)
    return db.query(SalonSettings).filter(SalonSettings.id == 1).with_for_update().one()


def get_settings(db: Session) -> SalonSettings:
    ensure_defaults(db)
    return db.query(SalonSettings).filter(SalonSettings.id == 1).one()


def get_working_hours(db: Session) -> list[WorkingHours]:
    ensure_defaults(db)
    return db.query(WorkingHours).order_by(WorkingHours.weekday).all()


def public_info(db: Session) -> dict:
    s = get_settings(db)
    return {
        "salon_name": app_settings.SALON_NAME,
        "currency": app_settings.CURRENCY,
        "whatsapp_number": s.whatsapp_number,
        "min_notice_minutes": s.min_notice_minutes,
        "max_days_ahead": s.max_days_ahead,
        "slot_interval_minutes": s.slot_interval_minutes,
        "working_hours": [
            {
                "weekday": w.weekday,
                "is_open": w.is_open,
                "open_time": w.open_time.strftime("%H:%M"),
                "close_time": w.close_time.strftime("%H:%M"),
            }
            for w in get_working_hours(db)
        ],
    }


##########################
# ADMIN

def update_settings(update, db: Session) -> SalonSettings:
    s = acquire_schedule_lock(db)
    for field, value in update.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


def update_working_hours(update, db: Session) -> list[WorkingHours]:
    acquire_schedule_lock(db)
    rows = {w.weekday: w for w in db.query(WorkingHours).all()}
    for day in update.days:
        row = rows[day.weekday]
        row.is_open = day.is_open
        row.open_time = day.open_time
        row.close_time = day.close_time
    db.commit()
    return get_working_hours(db)


def list_blocked_times(db: Session, from_dt: datetime) -> list[BlockedTime]:
    return (
        db.query(BlockedTime)
        .filter(BlockedTime.end_time > from_dt)
        .order_by(BlockedTime.start_time)
        .all()
    )


def add_blocked_time(payload, db: Session) -> dict:
    from core.timeutil import to_local_naive

    start = to_local_naive(payload.start_time)
    end = to_local_naive(payload.end_time)
    if end <= start:
        raise HTTPException(status_code=422, detail="End must be after start")

    acquire_schedule_lock(db)
    block = BlockedTime(start_time=start, end_time=end, reason=payload.reason)
    db.add(block)

    # Don't refuse: Dee may be blocking a day she's already decided to cancel.
    # Instead tell her which existing bookings now sit inside the blocked time.
    s = db.query(SalonSettings).filter(SalonSettings.id == 1).one()
    buf = timedelta(minutes=s.buffer_minutes)
    affected = (
        db.query(Booking)
        .filter(
            Booking.status.in_(ACTIVE_STATUSES),
            Booking.start_time < end,
            Booking.end_time > start - buf,  # shift the Python value, not the column (portable across SQLite/MySQL)
        )
        .order_by(Booking.start_time)
        .all()
    )
    db.commit()
    db.refresh(block)
    return {"blocked_time": block, "affected_bookings": affected}


def delete_blocked_time(block_id: int, db: Session) -> dict:
    block = db.query(BlockedTime).filter(BlockedTime.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Blocked time not found")
    db.delete(block)
    db.commit()
    return {"message": "Blocked time removed"}
