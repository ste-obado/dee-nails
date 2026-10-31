from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
from schema import Register, TokenResponse
from services import auth_service
from core.protection import oauth2_scheme
from core.rate_limit import rate_limiter
from core.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", dependencies=[Depends(rate_limiter(times=5, seconds=300, scope="register"))])
def register(newuser: Register, db: Session = Depends(get_db)):
    return auth_service.register_user(newuser, db)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limiter(times=10, seconds=60, scope="login-ip"))],
)
def login(login: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # note: this is an IP-based limit on top of auth_service's own
    # per-account attempt lockout — the two guard against different things
    # (one bot hitting many accounts vs one account being brute-forced).
    return auth_service.login_user(login, db)


@router.post("/logout")
def logout(token: str = Depends(oauth2_scheme)):
    return auth_service.logout_user(token, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
