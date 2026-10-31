from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.protection import require_admin
from core.timeutil import now_local
from database import get_db
from schema import (
    BlockedTimeCreate, BlockedTimeOut, BookingOut, SettingsOut, SettingsUpdate,
    WorkingHoursItem, WorkingHoursUpdate,
)
from services import schedule_service

router = APIRouter(prefix="/schedule", tags=["Schedule"])


@router.get("/info")
def public_info(db: Session = Depends(get_db)):
    """Salon name, WhatsApp number and opening hours for the customer site."""
    return schedule_service.public_info(db)


###############################
# ADMIN

@router.get("/admin/settings", response_model=SettingsOut)
def get_settings(user=Depends(require_admin), db: Session = Depends(get_db)):
    return schedule_service.get_settings(db)


@router.patch("/admin/settings", response_model=SettingsOut)
def update_settings(update: SettingsUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    return schedule_service.update_settings(update, db)


@router.get("/admin/working-hours", response_model=list[WorkingHoursItem])
def get_working_hours(user=Depends(require_admin), db: Session = Depends(get_db)):
    return schedule_service.get_working_hours(db)


@router.put("/admin/working-hours", response_model=list[WorkingHoursItem])
def update_working_hours(update: WorkingHoursUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    return schedule_service.update_working_hours(update, db)


@router.get("/admin/blocked-times", response_model=list[BlockedTimeOut])
def list_blocked_times(user=Depends(require_admin), db: Session = Depends(get_db)):
    return schedule_service.list_blocked_times(db, now_local())


@router.post("/admin/blocked-times")
def add_blocked_time(payload: BlockedTimeCreate, user=Depends(require_admin), db: Session = Depends(get_db)):
    result = schedule_service.add_blocked_time(payload, db)
    return {
        "blocked_time": BlockedTimeOut.model_validate(result["blocked_time"]),
        "affected_bookings": [BookingOut.model_validate(b) for b in result["affected_bookings"]],
    }


@router.delete("/admin/blocked-times/{block_id}")
def delete_blocked_time(block_id: int, user=Depends(require_admin), db: Session = Depends(get_db)):
    return schedule_service.delete_blocked_time(block_id, db)
