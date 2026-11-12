import re
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from typing import Optional, Literal


###############################
# ENUMS (mirror the DB enums, kept separate so the API layer
# doesn't have to import SQLAlchemy models)

from enum import Enum


class UserRole(str, Enum):
    admin = "admin"
    user = "user"


###############################
# AUTH SCHEMAS

class Register(BaseModel):
    # NOTE: role is deliberately NOT a field here. Public registration must
    # never let the client choose its own role — that was a real
    # privilege-escalation bug (anyone could POST role="admin" and get an
    # admin account). Every self-registered account is a plain "user";
    # admin accounts are created via scripts/create_admin.py instead.
    name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(max_length=72)  # bcrypt only uses the first 72 bytes —
    # anything past that is silently ignored, so two different passwords
    # sharing the same first 72 chars would both work. Reject rather than
    # silently accept a password whose "extra" length does nothing.
    confirm_password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, password: str) -> str:
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return password

    @model_validator(mode="after")
    def password_verify(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


###############################
# PROFILE SCHEMAS

class UpdateProfile(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    email: Optional[EmailStr] = None


###############################
# DEE NAILS: BOOKING SCHEMAS

class BookingStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


def normalize_ke_phone(raw: str) -> str:
    """0712 345 678 / +254712345678 / 254712345678 / 712345678 -> 254712345678."""
    digits = re.sub(r"[\s\-()]", "", raw or "")
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("0"):
        digits = "254" + digits[1:]
    elif len(digits) == 9 and digits[0] in "71":
        digits = "254" + digits
    if not re.fullmatch(r"254[71]\d{8}", digits):
        raise ValueError("Enter a valid Kenyan phone number, e.g. 0712345678")
    return digits


# ---- services

ImageFit = Literal["cover", "contain"]

class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    category: Optional[str] = Field(default=None, max_length=50)
    price: float = Field(ge=0, le=1_000_000)
    duration_minutes: int = Field(ge=5, le=480)
    image_fit: ImageFit = "cover"
    is_active: bool = True


class ServiceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    category: Optional[str] = Field(default=None, max_length=50)
    price: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=480)
    image_fit: Optional[ImageFit] = None
    is_active: Optional[bool] = None


class ServiceImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str


class ImageOrder(BaseModel):
    image_ids: list[int] = Field(min_length=1, max_length=4)


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    category: Optional[str]
    price: float
    duration_minutes: int
    image_url: Optional[str]          # the cover photo (first of `images`)
    image_fit: str
    images: list[ServiceImageOut] = []
    is_active: bool


# ---- bookings

class BookingCreate(BaseModel):
    # NOTE: no price, duration, status or end time here on purpose. The server
    # works all of those out from service_ids -- never trust the frontend.
    customer_name: str = Field(min_length=1, max_length=100)
    customer_phone: str = Field(max_length=20)
    notes: Optional[str] = Field(default=None, max_length=500)
    service_ids: list[int] = Field(min_length=1, max_length=10)
    start_time: datetime

    @field_validator("customer_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("customer_phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return normalize_ke_phone(v)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, v):
        v = v.strip() if v else v
        return v or None


class BookingLookup(BaseModel):
    reference: str = Field(min_length=4, max_length=12)
    customer_phone: str = Field(max_length=20)

    @field_validator("reference")
    @classmethod
    def clean_reference(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("customer_phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return normalize_ke_phone(v)


class BookingItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    service_id: int
    service_name: str
    price: float
    duration_minutes: int


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    customer_name: str
    customer_phone: str
    notes: Optional[str]
    start_time: datetime
    end_time: datetime
    total_price: float
    total_duration_minutes: int
    status: BookingStatus
    cancel_reason: Optional[str]
    created_at: Optional[datetime]
    items: list[BookingItemOut]


class BookingStatusOut(BaseModel):
    """What a client may see when checking their own booking. No phone or notes."""
    model_config = ConfigDict(from_attributes=True)

    reference: str
    customer_name: str
    start_time: datetime
    end_time: datetime
    total_price: float
    total_duration_minutes: int
    status: BookingStatus
    items: list[BookingItemOut]


class BookingCreated(BaseModel):
    booking: BookingOut
    whatsapp_url: Optional[str]      # opens WhatsApp to Dee with the details prefilled
    whatsapp_message: str


class BookingAction(BaseModel):
    booking: BookingOut
    whatsapp_url: Optional[str]      # opens WhatsApp to the CLIENT (admin actions)
    whatsapp_message: Optional[str]


class BookingStatusUpdate(BaseModel):
    status: BookingStatus
    reason: Optional[str] = Field(default=None, max_length=200)


class RescheduleRequest(BaseModel):
    start_time: datetime


class SlotsOut(BaseModel):
    date: date
    duration_minutes: int
    slots: list[str]                 # "09:00", "09:30", ...


# ---- schedule (working hours, blocked time, settings)

class WorkingHoursItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int = Field(ge=0, le=6)  # 0 = Monday
    is_open: bool
    open_time: time
    close_time: time

    @model_validator(mode="after")
    def closes_after_open(self):
        if self.is_open and self.close_time <= self.open_time:
            raise ValueError("Closing time must be after opening time")
        return self


class WorkingHoursUpdate(BaseModel):
    days: list[WorkingHoursItem] = Field(min_length=1, max_length=7)

    @model_validator(mode="after")
    def unique_days(self):
        weekdays = [d.weekday for d in self.days]
        if len(set(weekdays)) != len(weekdays):
            raise ValueError("Each weekday can only appear once")
        return self


class BlockedTimeCreate(BaseModel):
    start_time: datetime
    end_time: datetime
    reason: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def end_after_start(self):
        if self.end_time <= self.start_time:
            raise ValueError("End must be after start")
        return self


class BlockedTimeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_time: datetime
    end_time: datetime
    reason: Optional[str]


class SettingsUpdate(BaseModel):
    whatsapp_number: Optional[str] = Field(default=None, pattern=r"^(\d{10,15})?$")  # digits only, no "+"; "" clears it
    buffer_minutes: Optional[int] = Field(default=None, ge=0, le=120)
    min_notice_minutes: Optional[int] = Field(default=None, ge=0, le=10080)
    slot_interval_minutes: Optional[int] = Field(default=None, ge=5, le=120)
    max_days_ahead: Optional[int] = Field(default=None, ge=1, le=365)


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    whatsapp_number: str
    buffer_minutes: int
    min_notice_minutes: int
    slot_interval_minutes: int
    max_days_ahead: int
