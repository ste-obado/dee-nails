import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")  # development | production

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL")

    # JWT / auth
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # Redis
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))

    # CORS — comma-separated list of allowed origins, e.g.
    # "https://deenails.example,https://admin.deenails.example"
    FRONTEND_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]

    # Salon (Dee Nails)
    SALON_NAME: str = os.getenv("SALON_NAME", "Dee Nails")
    CURRENCY: str = os.getenv("CURRENCY", "KES")
    # Booking times are stored as plain local times at the salon (no timezone
    # math at all). Kenya is UTC+3 all year with no daylight saving, so one
    # fixed offset is enough -- and avoids needing the tzdata package on Docker.
    SALON_UTC_OFFSET_HOURS: float = float(os.getenv("SALON_UTC_OFFSET_HOURS", "3"))
    # Digits only, international format, no "+" -> e.g. 254712345678.
    # Only used to seed the settings row the first time; Dee can change it
    # from the admin panel afterwards.
    WHATSAPP_NUMBER: str = os.getenv("WHATSAPP_NUMBER", "")
    # Local storage is for development only. Set all R2 values in production.
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET: str = os.getenv("R2_BUCKET", "")
    R2_PUBLIC_BASE_URL: str = os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")

    @property
    def r2_enabled(self) -> bool:
        return bool(self.R2_ACCOUNT_ID and self.R2_ACCESS_KEY_ID and self.R2_SECRET_ACCESS_KEY and self.R2_BUCKET and self.R2_PUBLIC_BASE_URL)
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "8"))
    # Anti-spam: how many upcoming (pending/confirmed) bookings one phone
    # number may hold at once.
    MAX_UPCOMING_BOOKINGS_PER_PHONE: int = int(os.getenv("MAX_UPCOMING_BOOKINGS_PER_PHONE", "3"))

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
