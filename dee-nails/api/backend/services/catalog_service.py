from fastapi import HTTPException

from sqlalchemy.orm import selectinload

from models import SalonService, ServiceImage
from services import image_service


def list_services(db, include_inactive: bool = False):
    q = db.query(SalonService).options(selectinload(SalonService.images))
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
    for required in ("name", "price", "duration_minutes", "is_active", "description", "image_fit"):
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


MAX_IMAGES = 4


def _locked_service(service_id: int, db):
    """Lock the service row so two uploads at once can't push it past 4 photos."""
    svc = db.query(SalonService).filter(SalonService.id == service_id).with_for_update().first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return svc


def _renumber_and_sync_cover(svc, db):
    for i, img in enumerate(svc.images):
        img.position = i
    svc.image_url = svc.images[0].url if svc.images else None


def add_image(service_id: int, data: bytes, db):
    svc = _locked_service(service_id, db)
    if len(svc.images) >= MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"A service can have up to {MAX_IMAGES} photos. Remove one first.")
    path = image_service.save_service_image(data)   # validates and re-encodes; raises on a bad file
    svc.images.append(ServiceImage(url=path, position=len(svc.images)))
    db.flush()
    _renumber_and_sync_cover(svc, db)
    db.commit()
    db.refresh(svc)
    return svc


def remove_image(service_id: int, image_id: int, db):
    svc = _locked_service(service_id, db)
    img = next((i for i in svc.images if i.id == image_id), None)
    if img is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    path = img.url
    svc.images.remove(img)          # delete-orphan removes the row
    db.flush()
    _renumber_and_sync_cover(svc, db)
    db.commit()
    image_service.delete_service_image(path)   # only after the database change is safe
    db.refresh(svc)
    return svc


def reorder_images(service_id: int, image_ids: list[int], db):
    """First id in the list becomes the cover shown in the menu."""
    svc = _locked_service(service_id, db)
    current = {i.id: i for i in svc.images}
    if len(image_ids) != len(set(image_ids)) or set(image_ids) != set(current):
        raise HTTPException(status_code=400, detail="The list must contain each of this service's photos exactly once")
    for position, image_id in enumerate(image_ids):
        current[image_id].position = position
    db.flush()
    db.expire(svc, ["images"])      # reload in the new order
    _renumber_and_sync_cover(svc, db)
    db.commit()
    db.refresh(svc)
    return svc
