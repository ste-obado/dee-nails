"""
Service photos: validate, shrink and store.

Anything uploaded is re-encoded by Pillow into a fresh WebP file under a random
name. The original bytes are never stored or served, so a file that merely
*claims* to be an image (a script renamed to .jpg, an image with an embedded
payload) cannot survive the re-encode.
"""
import os
import uuid
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from core.config import settings

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_SIDE = 900
Image.MAX_IMAGE_PIXELS = 40_000_000  # refuse "decompression bomb" images


def _folder() -> str:
    path = os.path.join(settings.UPLOAD_DIR, "services")
    os.makedirs(path, exist_ok=True)
    return path


def save_service_image(data: bytes) -> str:
    """Returns the public path, e.g. /uploads/services/3f2a....webp"""
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Photo is too large (max {settings.MAX_UPLOAD_MB} MB)")
    try:
        img = Image.open(BytesIO(data))
        if img.format not in ALLOWED_FORMATS:
            raise HTTPException(status_code=400, detail="Please upload a JPG, PNG or WebP photo")
        img = ImageOps.exif_transpose(img)   # phone photos: respect rotation
        img = img.convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise HTTPException(status_code=400, detail="That file isn't a readable photo")

    name = f"{uuid.uuid4().hex}.webp"
    img.save(os.path.join(_folder(), name), "WEBP", quality=82)
    return f"/uploads/services/{name}"


def delete_service_image(public_path: str | None) -> None:
    """Remove a previously stored photo. Only touches files inside our own folder."""
    if not public_path or not public_path.startswith("/uploads/services/"):
        return
    name = os.path.basename(public_path)
    path = os.path.join(_folder(), name)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
