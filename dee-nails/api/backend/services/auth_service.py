from fastapi import HTTPException

from models import User, UserRole
from core.security import verify_password, hash_password, create_access_token
from redis_cache import redis_client, blacklist_token

MAX_LOGIN_ATTEMPTS = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 60


def register_user(newuser, db):
    existing_user = db.query(User).filter(User.email == newuser.email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    db_user = User(
        username=newuser.name,
        email=newuser.email,
        role=UserRole.user,  # always — see the note on schema.Register
        password=hash_password(newuser.password),
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return {"message": "Account created successfully"}


def login_user(login, db):
    redis_key = f"login_attempts:{login.username}"
    attempts = int(redis_client.get(redis_key) or 0)

    if attempts >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=403, detail="Too many login attempts. Please try again later.")

    user = db.query(User).filter(User.email == login.username).first()

    if user is None or not verify_password(login.password, user.password):
        counter = redis_client.incr(redis_key)
        if counter == 1:
            redis_client.expire(redis_key, LOGIN_ATTEMPT_WINDOW_SECONDS)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    redis_client.delete(redis_key)  # reset attempts counter on success

    token = create_access_token(data={"sub": user.id, "role": user.role.value})
    return {"access_token": token, "token_type": "bearer"}


def logout_user(token: str, expire_seconds: int):
    blacklist_token(token, expire_seconds)
    return {"message": "Logged out"}
