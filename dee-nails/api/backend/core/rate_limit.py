from fastapi import HTTPException, Request

from redis_cache import redis_client


def rate_limiter(times: int, seconds: int, scope: str):
    """
    Fixed-window rate limiter, keyed by client IP + a route-specific scope
    (so /auth/login and /bookings don't share one bucket).

    Usage: Depends(rate_limiter(times=5, seconds=60, scope="login"))
    """

    def dependency(request: Request):
        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{scope}:{client_ip}"

        current = redis_client.incr(key)
        if current == 1:
            redis_client.expire(key, seconds)

        if current > times:
            ttl = redis_client.ttl(key)
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Try again in {max(ttl, 1)} seconds.",
            )

    return dependency
