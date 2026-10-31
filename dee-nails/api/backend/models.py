import uuid
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, Integer, ForeignKey, DateTime, TIMESTAMP,
    Numeric, Boolean, Time, func, Enum as SAEnum, UniqueConstraint, CheckConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


class UserRole(PyEnum):
    admin = "admin"
    user = "user"


class BookingStatus(PyEnum):
    pending = "pending"        # client booked, Dee hasn't confirmed yet
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


#######################
# USER
class User(Base):
    __tablename__ = "user"

    id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), nullable=False)
    email = Column(String(120), nullable=False, unique=True, index=True)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.user)
    password = Column(String(255), nullable=False)  # bcrypt hashes are ~60 chars
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


#######################
# DEE NAILS: BOOKING ENGINE
#
# All datetimes below are plain local salon time (no timezone attached) --
# see core/timeutil.py for why.

class SalonService(Base):
    """A thing a client can book (gel polish, full set, removal...).
    What a client can book, with a price and how long it takes."""
    __tablename__ = "salon_services"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(String(500), nullable=False, default="")
    category = Column(String(50), nullable=True)  # e.g. "Manicure", "Pedicure", "Add-ons"
    price = Column(Numeric(10, 2), nullable=False, default=0.00)
    duration_minutes = Column(Integer, nullable=False)
    image_url = Column(String(500), nullable=True)
    # services are archived instead of deleted: old bookings still point at them
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_salon_service_price_nonnegative"),
        CheckConstraint("duration_minutes > 0 AND duration_minutes <= 480", name="ck_salon_service_duration_range"),
    )


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    reference = Column(String(12), nullable=False, unique=True, index=True)  # e.g. DN-7K2QX9
    customer_name = Column(String(100), nullable=False)
    customer_phone = Column(String(20), nullable=False, index=True)  # normalised 2547XXXXXXXX
    notes = Column(String(500), nullable=True)
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=False)
    # snapshots computed on the server at booking time, so later price or
    # duration edits to a service don't rewrite history
    total_price = Column(Numeric(10, 2), nullable=False, default=0.00)
    total_duration_minutes = Column(Integer, nullable=False)
    status = Column(SAEnum(BookingStatus), nullable=False, default=BookingStatus.pending)
    cancel_reason = Column(String(200), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    cancelled_at = Column(DateTime, nullable=True)

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_booking_end_after_start"),
    )

    items = relationship("BookingItem", back_populates="booking", cascade="all, delete-orphan")


class BookingItem(Base):
    __tablename__ = "booking_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(Integer, ForeignKey("salon_services.id", ondelete="RESTRICT"), nullable=False)
    service_name = Column(String(100), nullable=False)      # snapshot
    price = Column(Numeric(10, 2), nullable=False)          # snapshot
    duration_minutes = Column(Integer, nullable=False)      # snapshot

    booking = relationship("Booking", back_populates="items")


class BlockedTime(Base):
    """Time Dee marks as unavailable: lunch, a sick day, a holiday."""
    __tablename__ = "blocked_times"

    id = Column(Integer, primary_key=True, autoincrement=True)
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=False)
    reason = Column(String(200), nullable=True)

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="ck_blocked_end_after_start"),
    )


class WorkingHours(Base):
    """One row per weekday (0 = Monday ... 6 = Sunday)."""
    __tablename__ = "working_hours"

    id = Column(Integer, primary_key=True, autoincrement=True)
    weekday = Column(Integer, nullable=False, unique=True)
    is_open = Column(Boolean, nullable=False, default=True)
    open_time = Column(Time, nullable=False)
    close_time = Column(Time, nullable=False)

    __table_args__ = (
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_working_hours_weekday"),
    )


class SalonSettings(Base):
    """Exactly one row (id = 1). Doubles as the lock that serialises bookings."""
    __tablename__ = "salon_settings"

    id = Column(Integer, primary_key=True)
    whatsapp_number = Column(String(20), nullable=False, default="")
    buffer_minutes = Column(Integer, nullable=False, default=0)          # cleanup gap after each booking
    min_notice_minutes = Column(Integer, nullable=False, default=120)    # no bookings sooner than this
    slot_interval_minutes = Column(Integer, nullable=False, default=30)  # how far apart start times are
    max_days_ahead = Column(Integer, nullable=False, default=60)

    __table_args__ = (
        CheckConstraint("buffer_minutes >= 0", name="ck_settings_buffer_nonnegative"),
        CheckConstraint("slot_interval_minutes >= 5", name="ck_settings_interval_min"),
    )
