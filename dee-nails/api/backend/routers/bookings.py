from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.protection import require_admin
from core.rate_limit import rate_limiter
from database import get_db
from schema import (
    BookingAction, BookingCreate, BookingCreated, BookingLookup, BookingOut, BookingStatus, BookingStatusOut,
    BookingStatusUpdate, RescheduleRequest, SlotsOut,
)
from services import booking_service

router = APIRouter(prefix="/bookings", tags=["Bookings"])


###############################
# PUBLIC -- no account needed, clients book as guests

@router.get("/slots", response_model=SlotsOut,
            dependencies=[Depends(rate_limiter(times=60, seconds=60, scope="booking-slots"))])
def get_slots(
    date: date,
    service_ids: list[int] = Query(..., min_length=1, max_length=10),
    db: Session = Depends(get_db),
):
    return booking_service.get_slots(date, service_ids, db)


@router.post("/", response_model=BookingCreated,
             dependencies=[Depends(rate_limiter(times=10, seconds=3600, scope="booking-create"))])
def create_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    return booking_service.create_booking(payload, db)


@router.post("/lookup", response_model=BookingStatusOut,
             dependencies=[Depends(rate_limiter(times=15, seconds=600, scope="booking-lookup"))])
def lookup_booking(payload: BookingLookup, db: Session = Depends(get_db)):
    return booking_service.lookup(payload.reference, payload.customer_phone, db)


###############################
# ADMIN (Dee)

@router.get("/admin", response_model=list[BookingOut])
def list_bookings(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    status: Optional[BookingStatus] = None,
    user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    return booking_service.list_bookings(db, from_date, to_date, status)


@router.patch("/admin/{booking_id}/status", response_model=BookingAction)
def update_status(booking_id: int, update: BookingStatusUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    return booking_service.update_status(booking_id, update.status, update.reason, db)


@router.post("/admin/{booking_id}/reschedule", response_model=BookingAction)
def reschedule(booking_id: int, payload: RescheduleRequest, user=Depends(require_admin), db: Session = Depends(get_db)):
    return booking_service.reschedule(booking_id, payload.start_time, db)
