from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from core.config import settings
from core.protection import require_admin
from database import get_db
from schema import ServiceCreate, ServiceOut, ServiceUpdate
from services import catalog_service

router = APIRouter(prefix="/services", tags=["Services"])


@router.get("/", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)):
    return catalog_service.list_services(db)


# /admin/all must be declared before any /{id} route
@router.get("/admin/all", response_model=list[ServiceOut])
def list_all_services(user=Depends(require_admin), db: Session = Depends(get_db)):
    return catalog_service.list_services(db, include_inactive=True)


@router.post("/", response_model=ServiceOut)
def add_service(payload: ServiceCreate, user=Depends(require_admin), db: Session = Depends(get_db)):
    return catalog_service.add_service(payload, db)


@router.patch("/{service_id}", response_model=ServiceOut)
def update_service(service_id: int, update: ServiceUpdate, user=Depends(require_admin), db: Session = Depends(get_db)):
    return catalog_service.update_service(service_id, update, db)


@router.delete("/{service_id}")
def archive_service(service_id: int, user=Depends(require_admin), db: Session = Depends(get_db)):
    return catalog_service.archive_service(service_id, db)


@router.post("/{service_id}/image", response_model=ServiceOut)
async def upload_image(service_id: int, file: UploadFile = File(...), user=Depends(require_admin), db: Session = Depends(get_db)):
    # read one byte past the limit so an oversized file is rejected without loading all of it
    data = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    return catalog_service.set_image(service_id, data, db)


@router.delete("/{service_id}/image", response_model=ServiceOut)
def remove_image(service_id: int, user=Depends(require_admin), db: Session = Depends(get_db)):
    return catalog_service.remove_image(service_id, db)
