import redis

from core.config import settings

redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    decode_responses=True,  # returns strings instead of bytes
)


def blacklist_token(token: str, expire_seconds: int) -> None:
    redis_client.set(f"blacklist:{token}", "1", ex=expire_seconds)


def is_token_blacklisted(token: str) -> bool:
    return redis_client.exists(f"blacklist:{token}") == 1
