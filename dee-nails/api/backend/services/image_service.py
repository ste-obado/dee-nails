"""Validate, optimize and store service photos in Cloudflare R2 (or locally in dev)."""
import os
import uuid
from io import BytesIO

import boto3
from botocore.config import Config
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from core.config import settings

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_SIDE = 900
Image.MAX_IMAGE_PIXELS = 40_000_000


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _flatten_on_white(img: Image.Image) -> Image.Image:
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if not has_alpha:
        return img.convert("RGB")
    rgba = img.convert("RGBA")
    background = Image.new("RGB", rgba.size, (255, 255, 255))
    background.paste(rgba, mask=rgba.getchannel("A"))
    return background


def save_service_image(data: bytes) -> str:
    """Return a public R2 URL when configured, otherwise a local dev path."""
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Photo is too large (max {settings.MAX_UPLOAD_MB} MB)")
    try:
        img = Image.open(BytesIO(data))
        if img.format not in ALLOWED_FORMATS:
            raise HTTPException(status_code=400, detail="Please upload a JPG, PNG or WebP photo")
        img = ImageOps.exif_transpose(img)
        img = _flatten_on_white(img)
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        output = BytesIO()
        img.save(output, "WEBP", quality=82)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise HTTPException(status_code=400, detail="That file isn't a readable photo")

    name = f"services/{uuid.uuid4().hex}.webp"
    if settings.r2_enabled:
        try:
            _r2_client().put_object(
                Bucket=settings.R2_BUCKET, Key=name, Body=output.getvalue(),
                ContentType="image/webp", CacheControl="public, max-age=31536000, immutable",
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Could not store photo in image storage") from exc
        return f"{settings.R2_PUBLIC_BASE_URL}/{name}"

    folder = os.path.join(settings.UPLOAD_DIR, "services")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, os.path.basename(name)), "wb") as file:
        file.write(output.getvalue())
    return f"/uploads/{name}"


def delete_service_image(public_path: str | None) -> None:
    if not public_path:
        return
    if settings.r2_enabled and public_path.startswith(settings.R2_PUBLIC_BASE_URL + "/"):
        key = public_path[len(settings.R2_PUBLIC_BASE_URL) + 1:]
        if not key.startswith("services/") or ".." in key:
            return
        try:
            _r2_client().delete_object(Bucket=settings.R2_BUCKET, Key=key)
        except Exception:
            # DB deletion has already committed; avoid failing the API response.
            pass
        return
    if public_path.startswith("/uploads/services/"):
        name = os.path.basename(public_path)
        try:
            os.remove(os.path.join(settings.UPLOAD_DIR, "services", name))
        except FileNotFoundError:
            pass
