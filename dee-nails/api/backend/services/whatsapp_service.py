"""
Builds the WhatsApp messages and wa.me links.

No WhatsApp API is involved: a wa.me link just opens the WhatsApp app with a
chat and a prefilled message, and the person taps Send. That's free and needs
no Meta account. The flip side is that WhatsApp never tells us the message was
sent -- which is why the booking is saved in our database first and this link
is only the notification.
"""
from typing import Optional
from urllib.parse import quote

from core.config import settings


def _time(dt) -> str:
    return f"{dt.hour % 12 or 12}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}"


def _day(dt) -> str:
    return f"{dt:%a} {dt.day} {dt:%b %Y}"


def _money(value) -> str:
    return f"{settings.CURRENCY} {float(value):,.0f}"


def wa_link(number: str, text: str) -> Optional[str]:
    if not number:
        return None
    return f"https://wa.me/{number}?text={quote(text)}"


def _details(booking) -> str:
    lines = [
        f"Ref: {booking.reference}",
        f"Date: {_day(booking.start_time)}",
        f"Time: {_time(booking.start_time)} - {_time(booking.end_time)}",
        "Services:",
    ]
    for item in booking.items:
        lines.append(f"- {item.service_name} ({_money(item.price)}, {item.duration_minutes} min)")
    lines.append(f"Total: {_money(booking.total_price)} ({booking.total_duration_minutes} min)")
    return "\n".join(lines)


def message_to_salon(booking) -> str:
    """Sent BY the client TO Dee when a booking is made."""
    parts = [
        f"Hi {settings.SALON_NAME}! I'd like to book an appointment.",
        "",
        f"Name: {booking.customer_name}",
        _details(booking),
    ]
    if booking.notes:
        parts.append(f"Notes: {booking.notes}")
    return "\n".join(parts)


def message_to_client(booking, kind: str, old_start=None, reason: Optional[str] = None) -> str:
    """Sent BY Dee TO the client. kind: confirmed | cancelled | rescheduled."""
    name = booking.customer_name.split()[0]
    if kind == "confirmed":
        head = f"Hi {name}, your appointment at {settings.SALON_NAME} is confirmed. See you then!"
    elif kind == "cancelled":
        head = f"Hi {name}, I'm sorry, I have to cancel your appointment at {settings.SALON_NAME}."
        if reason:
            head += f" Reason: {reason}."
        head += " Please message me to rebook."
    elif kind == "rescheduled":
        head = (
            f"Hi {name}, I've had to move your appointment at {settings.SALON_NAME} "
            f"from {_day(old_start)}, {_time(old_start)} to the time below. "
            "Please reply if that doesn't work for you."
        )
    else:
        raise ValueError(f"Unknown message kind: {kind}")
    return f"{head}\n\n{_details(booking)}"
