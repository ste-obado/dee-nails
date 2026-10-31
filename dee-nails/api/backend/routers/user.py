from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schema import UpdateProfile
from services import user_service
from core.protection import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
def get_profile(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.profile_view(user, db)


@router.patch("/me")
def update_profile(update: UpdateProfile, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.account_update(update, user, db)


@router.delete("/me")
def delete_account(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.delete_account(user, db)
