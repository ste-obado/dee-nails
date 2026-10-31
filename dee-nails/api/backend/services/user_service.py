import json

from fastapi import HTTPException

from models import User
from redis_cache import redis_client

CACHE_TTL_SECONDS = 3600


def profile_view(user, db):
    cache_key = f"user:{user.id}"
    cached = redis_client.get(cache_key)
    if cached:
        return {"profile": json.loads(cached)}

    db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = {
        "username": db_user.username,
        "email": db_user.email,
        "role": db_user.role.value,
        "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
    }

    redis_client.set(cache_key, json.dumps(profile), ex=CACHE_TTL_SECONDS)
    return {"profile": profile}


def account_update(update, user, db):
    db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    updated_data = update.model_dump(exclude_unset=True)

    if "email" in updated_data:
        email_taken = (
            db.query(User)
            .filter(User.email == updated_data["email"], User.id != user.id)
            .first()
        )
        if email_taken:
            raise HTTPException(status_code=409, detail="Email already in use")

    # incoming field is "name" on the API, maps to the "username" column
    if "name" in updated_data:
        db_user.username = updated_data.pop("name")

    for field, value in updated_data.items():
        setattr(db_user, field, value)

    db.commit()
    db.refresh(db_user)

    redis_client.delete(f"user:{user.id}")  # invalidate stale cache

    return {
        "message": "Profile updated",
        "name": db_user.username,
        "email": db_user.email,
    }


def delete_account(user, db):
    db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(db_user)
    db.commit()
    redis_client.delete(f"user:{user.id}")

    return {"message": "Account deleted"}
