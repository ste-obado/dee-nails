"""
Create an admin account directly in the database — run from the server/
your machine, never exposed over HTTP. This is the ONLY way to create an
admin account now that /auth/register always forces role=user (letting
registration accept a client-supplied role was a real privilege-escalation
bug — anyone could have POSTed role=admin and gotten in).

Usage:
    python -m scripts.create_admin
(run from the backend/ directory, with your .env already set up)
"""
import getpass
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import User, UserRole
from core.security import hash_password


def main():
    email = input("Admin email: ").strip()
    name = input("Admin name: ").strip()
    password = getpass.getpass("Admin password (min 8 chars): ")

    if len(password) < 8:
        print("Password must be at least 8 characters.")
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"A user with email {email} already exists (role={existing.role.value}).")
            if existing.role != UserRole.admin:
                confirm = input("Promote this existing user to admin instead? [y/N] ")
                if confirm.lower() == "y":
                    existing.role = UserRole.admin
                    db.commit()
                    print("Promoted to admin.")
            return

        admin = User(
            username=name,
            email=email,
            role=UserRole.admin,
            password=hash_password(password),
        )
        db.add(admin)
        db.commit()
        print(f"Admin account created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
