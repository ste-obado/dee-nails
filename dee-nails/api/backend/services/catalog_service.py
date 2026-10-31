from fastapi import HTTPException

from models import SalonService
from services import image_service


def list_services(db, include_inactive: bool = False):
    q = db.query(SalonService)
    if not include_inactive:
        q = q.filter(SalonService.is_active.is_(True))
    return q.order_by(SalonService.category, SalonService.name).all()


def add_service(payload, db):
    if db.query(SalonService).filter(SalonService.name == payload.name).first():
        raise HTTPException(status_code=400, detail="A service with this name already exists")
    svc = SalonService(**payload.model_dump())
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return svc


def update_service(service_id: int, update, db):
    svc = db.query(SalonService).filter(SalonService.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    data = update.model_dump(exclude_unset=True)
    # null isn't a valid value for these columns
    for required in ("name", "price", "duration_minutes", "is_active", "description"):
        if required in data and data[required] is None:
            data.pop(required)

    if "name" in data:
        clash = (
            db.query(SalonService)
            .filter(SalonService.name == data["name"], SalonService.id != service_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="A service with this name already exists")

    for field, value in data.items():
        setattr(svc, field, value)
    db.commit()
    db.refresh(svc)
    return svc


def archive_service(service_id: int, db):
    """Soft delete: past bookings keep pointing at the service, new ones can't use it."""
    svc = db.query(SalonService).filter(SalonService.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    svc.is_active = False
    db.commit()
    return {"message": "Service archived"}


def set_image(service_id: int, data: bytes, db):
    svc = db.query(SalonService).filter(SalonService.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    new_path = image_service.save_service_image(data)
    old_path = svc.image_url
    svc.image_url = new_path
    db.commit()
    image_service.delete_service_image(old_path)   # only after the new one is safely saved
    db.refresh(svc)
    return svc


def remove_image(service_id: int, db):
    svc = db.query(SalonService).filter(SalonService.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    old_path = svc.image_url
    svc.image_url = None
    db.commit()
    image_service.delete_service_image(old_path)
    db.refresh(svc)
    return svc
