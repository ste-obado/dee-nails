from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
from core.security import verify_access_token, credentials_exception
from redis_cache import is_token_blacklisted
from schema import UserRole
import models

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    if is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Token revoked, please log in again")

    payload = verify_access_token(token)
    user_id = payload.get("sub")

    if user_id is None:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception

    return user


###############################
# role_checker

def role_requirement(*roles: UserRole):
    def role_checker(user: models.User = Depends(get_current_user)):
        if user.role.value not in [r.value for r in roles]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        return user

    return role_checker


require_admin = role_requirement(UserRole.admin)
require_user = role_requirement(UserRole.user, UserRole.admin)
require_user_or_admin = role_requirement(UserRole.user, UserRole.admin)
