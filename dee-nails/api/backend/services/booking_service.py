import secrets
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from core.config import settings as app_settings
from core.timeutil import now_local, to_local_naive
from models import Booking, BookingItem, BookingStatus, BlockedTime, SalonService, WorkingHours
from services import schedule_service, whatsapp_service
from services.schedule_service import ACTIVE_STATUSES
from services.slot_service import Interval, compute_free_slots, has_conflict

# which status changes Dee may make. Finished states are final.
ALLOWED_TRANSITIONS = {
    BookingStatus.pending: {BookingStatus.confirmed, BookingStatus.cancelled},
    BookingStatus.confirmed: {BookingStatus.completed, BookingStatus.cancelled, BookingStatus.no_show},
    BookingStatus.completed: set(),
    BookingStatus.cancelled: set(),
    BookingStatus.no_show: set(),
}

_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I -- easy to read out over WhatsApp


def _new_reference(db: Session) -> str:
    for _ in range(10):
        ref = "DN-" + "".join(secrets.choice(_REF_ALPHABET) for _ in range(6))
        if not db.query(Booking.id).filter(Booking.reference == ref).first():
            return ref
    raise HTTPException(status_code=500, detail="Could not generate a booking reference")


##########################
# helpers

def _load_services(service_ids: list[int], db: Session) -> list[SalonService]:
    ids = list(dict.fromkeys(service_ids))  # drop duplicates, keep order
    found = db.query(SalonService).filter(SalonService.id.in_(ids)).all()
    by_id = {s.id: s for s in found}
    missing = [i for i in ids if i not in by_id or not by_id[i].is_active]
    if missing:
        raise HTTPException(status_code=400, detail="One or more selected services are not available")
    return [by_id[i] for i in ids]


def _day_context(db: Session, day: date, exclude_booking_id: Optional[int] = None):
    """Active bookings and blocked periods that could touch `day`."""
    day_start = datetime.combine(day, time.min)
    day_end = day_start + timedelta(days=1)
    margin = timedelta(days=1)  # also catches anything spilling over midnight

    q = db.query(Booking).filter(
        Booking.status.in_(ACTIVE_STATUSES),
        Booking.start_time < day_end + margin,
        Booking.end_time > day_start - margin,
    )
    if exclude_booking_id is not None:
        q = q.filter(Booking.id != exclude_booking_id)
    bookings = [Interval(b.start_time, b.end_time) for b in q.all()]

    blocks = [
        Interval(k.start_time, k.end_time)
        for k in db.query(BlockedTime).filter(
            BlockedTime.start_time < day_end + margin,
            BlockedTime.end_time > day_start - margin,
        )
    ]
    return bookings, blocks


def _hours_for(db: Session, day: date) -> Optional[WorkingHours]:
    return db.query(WorkingHours).filter(WorkingHours.weekday == day.weekday()).first()


def _free_slots(db: Session, day: date, duration_minutes: int, s, exclude_booking_id=None):
    bookings, blocks = _day_context(db, day, exclude_booking_id)
    return compute_free_slots(
        day, duration_minutes, _hours_for(db, day), s, bookings, blocks, now_local()
    )


##########################
# PUBLIC

def get_slots(day: date, service_ids: list[int], db: Session) -> dict:
    schedule_service.ensure_defaults(db)
    s = schedule_service.get_settings(db)
    services = _load_services(service_ids, db)
    duration = sum(sv.duration_minutes for sv in services)
    slots = _free_slots(db, day, duration, s)
    return {"date": day, "duration_minutes": duration, "slots": [t.strftime("%H:%M") for t in slots]}


def create_booking(payload, db: Session) -> dict:
    # Take the calendar lock FIRST. Everything below (read the calendar, check
    # for clashes, insert) then happens while no one else can book.
    s = schedule_service.acquire_schedule_lock(db)

    services = _load_services(payload.service_ids, db)
    duration = sum(sv.duration_minutes for sv in services)
    total_price = sum(float(sv.price) for sv in services)  # computed here, never from the client

    start = to_local_naive(payload.start_time)
    end = start + timedelta(minutes=duration)

    hours = _hours_for(db, start.date())
    if hours is None or not hours.is_open:
        raise HTTPException(status_code=409, detail=f"{app_settings.SALON_NAME} is closed that day. Please pick another date.")

    # re-run the exact same rules used to display slots: working hours, notice,
    # buffer, blocked time and existing bookings. Also guarantees the start
    # time sits on the slot grid.
    if start not in _free_slots(db, start.date(), duration, s):
        raise HTTPException(status_code=409, detail="Sorry, that time is no longer available. Please pick another slot.")

    upcoming = (
        db.query(Booking)
        .filter(
            Booking.customer_phone == payload.customer_phone,
            Booking.status.in_(ACTIVE_STATUSES),
            Booking.end_time >= now_local(),
        )
        .count()
    )
    if upcoming >= app_settings.MAX_UPCOMING_BOOKINGS_PER_PHONE:
        raise HTTPException(
            status_code=400,
            detail="You already have the maximum number of upcoming bookings. Please message us on WhatsApp to change one.",
        )

    booking = Booking(
        reference=_new_reference(db),
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        notes=payload.notes,
        start_time=start,
        end_time=end,
        total_price=total_price,
        total_duration_minutes=duration,
        status=BookingStatus.pending,
    )
    for sv in services:
        booking.items.append(BookingItem(
            service_id=sv.id,
            service_name=sv.name,
            price=sv.price,
            duration_minutes=sv.duration_minutes,
        ))
    db.add(booking)
    db.commit()
    db.refresh(booking)

    text = whatsapp_service.message_to_salon(booking)
    return {
        "booking": booking,
        "whatsapp_url": whatsapp_service.wa_link(s.whatsapp_number, text),
        "whatsapp_message": text,
    }


##########################
# ADMIN

def list_bookings(db: Session, from_date: Optional[date], to_date: Optional[date], status: Optional[BookingStatus]):
    today = now_local().date()
    from_date = from_date or today
    to_date = to_date or (from_date + timedelta(days=7))
    if to_date < from_date:
        raise HTTPException(status_code=422, detail="to_date must not be before from_date")
    if (to_date - from_date).days > 92:
        raise HTTPException(status_code=422, detail="Date range too large (max 92 days)")

    if status is not None:
        status = BookingStatus(status.value)  # API enum -> DB enum (different classes)

    q = db.query(Booking).filter(
        Booking.start_time >= datetime.combine(from_date, time.min),
        Booking.start_time < datetime.combine(to_date + timedelta(days=1), time.min),
    )
    if status is not None:
        q = q.filter(Booking.status == status)
    return q.order_by(Booking.start_time).all()


def _get_booking(booking_id: int, db: Session) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def _client_link(booking: Booking, text: str) -> Optional[str]:
    return whatsapp_service.wa_link(booking.customer_phone, text)


def update_status(booking_id: int, new_status: BookingStatus, reason: Optional[str], db: Session) -> dict:
    new_status = BookingStatus(new_status.value)  # API enum -> DB enum (different classes)
    schedule_service.acquire_schedule_lock(db)
    booking = _get_booking(booking_id, db)

    if new_status not in ALLOWED_TRANSITIONS[booking.status]:
        raise HTTPException(
            status_code=400,
            detail=f"Can't change a {booking.status.value} booking to {new_status.value}",
        )

    booking.status = new_status
    if new_status == BookingStatus.cancelled:
        booking.cancelled_at = now_local()
        booking.cancel_reason = reason
    db.commit()
    db.refresh(booking)

    text = None
    if new_status == BookingStatus.confirmed:
        text = whatsapp_service.message_to_client(booking, "confirmed")
    elif new_status == BookingStatus.cancelled:
        text = whatsapp_service.message_to_client(booking, "cancelled", reason=reason)
    return {
        "booking": booking,
        "whatsapp_url": _client_link(booking, text) if text else None,
        "whatsapp_message": text,
    }


def reschedule(booking_id: int, new_start_raw: datetime, db: Session) -> dict:
    s = schedule_service.acquire_schedule_lock(db)
    booking = _get_booking(booking_id, db)

    if booking.status not in ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail=f"A {booking.status.value} booking can't be rescheduled")

    new_start = to_local_naive(new_start_raw)
    if new_start < now_local():
        raise HTTPException(status_code=400, detail="Can't move a booking into the past")
    new_end = new_start + timedelta(minutes=booking.total_duration_minutes)

    # Dee may deliberately move someone outside normal hours or inside the
    # notice window, so only real clashes are refused -- and the booking being
    # moved is excluded, otherwise it would clash with its own old slot.
    bookings, blocks = _day_context(db, new_start.date(), exclude_booking_id=booking.id)
    if has_conflict(new_start, new_end, bookings, blocks, s.buffer_minutes):
        raise HTTPException(status_code=409, detail="That time clashes with another booking or blocked time")

    old_start = booking.start_time
    booking.start_time = new_start
    booking.end_time = new_end
    db.commit()
    db.refresh(booking)

    text = whatsapp_service.message_to_client(booking, "rescheduled", old_start=old_start)
    return {"booking": booking, "whatsapp_url": _client_link(booking, text), "whatsapp_message": text}


def lookup(reference: str, phone: str, db: Session) -> Booking:
    """Client checks their own booking. Needs the reference AND the phone it was booked with."""
    booking = db.query(Booking).filter(Booking.reference == reference, Booking.customer_phone == phone).first()
    if not booking:
        # same answer whether the reference or the phone was wrong
        raise HTTPException(status_code=404, detail="No booking found with that reference and phone number")
    return booking
