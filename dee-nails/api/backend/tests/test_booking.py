"""
Dee Nails booking engine: slot maths, clash detection, WhatsApp links,
cancel / reschedule, and the admin-only guards.
"""
import uuid
from datetime import date, datetime, time, timedelta
from urllib.parse import parse_qs, unquote, urlparse

import pytest

import models
from core.timeutil import now_local
from database import SessionLocal
from services import booking_service
from services.slot_service import Interval, has_conflict

MON, SUN = 0, 6


###############################
# helpers

@pytest.fixture(autouse=True)
def clean_booking_tables():
    """Booking tests share one DB, so wipe calendar state before every test.
    Deleting settings/working hours makes them re-seed with the defaults."""
    db = SessionLocal()
    for table in (models.BookingItem, models.Booking, models.BlockedTime,
                  models.SalonService, models.WorkingHours, models.SalonSettings):
        db.query(table).delete()
    db.commit()
    db.close()
    yield


def upcoming(weekday: int, weeks_ahead: int = 1) -> date:
    """A future date falling on `weekday`, at least 2 days from now."""
    d = now_local().date() + timedelta(days=2)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d + timedelta(weeks=weeks_ahead - 1)


def make_service(client, admin_headers, duration=60, price=1000, name=None, **extra):
    r = client.post("/services/", headers=admin_headers, json={
        "name": name or f"Service {uuid.uuid4().hex[:6]}",
        "price": price,
        "duration_minutes": duration,
        **extra,
    })
    assert r.status_code == 200, r.text
    return r.json()


def slots(client, day, *service_ids):
    r = client.get("/bookings/slots", params={"date": str(day), "service_ids": list(service_ids)})
    assert r.status_code == 200, r.text
    return r.json()["slots"]


def book(client, service_ids, day, hhmm, phone="0712345678", name="Amina Wanjiku", **extra):
    return client.post("/bookings/", json={
        "customer_name": name,
        "customer_phone": phone,
        "service_ids": service_ids,
        "start_time": f"{day}T{hhmm}:00",
        **extra,
    })


###############################
# pure slot maths

def test_back_to_back_is_not_a_clash():
    d = datetime(2030, 1, 7)
    existing = [Interval(d.replace(hour=12), d.replace(hour=13))]
    assert not has_conflict(d.replace(hour=13), d.replace(hour=14), existing, [], buffer_minutes=0)
    assert has_conflict(d.replace(hour=12, minute=30), d.replace(hour=13, minute=30), existing, [], buffer_minutes=0)


def test_buffer_pushes_next_booking_later():
    d = datetime(2030, 1, 7)
    existing = [Interval(d.replace(hour=12), d.replace(hour=13))]
    assert has_conflict(d.replace(hour=13), d.replace(hour=14), existing, [], buffer_minutes=15)
    assert not has_conflict(d.replace(hour=13, minute=15), d.replace(hour=14), existing, [], buffer_minutes=15)


###############################
# services

def test_public_service_list_hides_archived(client, admin_headers):
    keep = make_service(client, admin_headers, name="Gel polish")
    gone = make_service(client, admin_headers, name="Old special")
    assert client.delete(f"/services/{gone['id']}", headers=admin_headers).status_code == 200

    names = [s["name"] for s in client.get("/services/").json()]
    assert "Gel polish" in names and "Old special" not in names


def test_service_management_requires_admin(client, user_headers):
    payload = {"name": "Sneaky", "price": 1, "duration_minutes": 30}
    assert client.post("/services/", json=payload).status_code == 401
    assert client.post("/services/", json=payload, headers=user_headers).status_code == 403


def test_cannot_book_archived_service(client, admin_headers):
    svc = make_service(client, admin_headers)
    client.delete(f"/services/{svc['id']}", headers=admin_headers)
    r = book(client, [svc["id"]], upcoming(MON), "10:00")
    assert r.status_code == 400


###############################
# slots

def test_open_day_slots_run_from_opening_to_last_fit(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    s = slots(client, upcoming(MON), svc["id"])
    assert s[0] == "09:00"
    assert s[-1] == "17:00"          # a 60-min service starting 17:00 ends at closing (18:00)
    assert "17:30" not in s
    assert len(s) == 17              # 09:00 ... 17:00 every 30 minutes


def test_long_service_must_finish_before_closing(client, admin_headers):
    svc = make_service(client, admin_headers, duration=180)
    assert slots(client, upcoming(MON), svc["id"])[-1] == "15:00"


def test_closed_day_has_no_slots_and_rejects_booking(client, admin_headers):
    svc = make_service(client, admin_headers)
    sunday = upcoming(SUN)
    assert slots(client, sunday, svc["id"]) == []
    assert book(client, [svc["id"]], sunday, "10:00").status_code == 409


def test_slots_combine_durations_of_all_selected_services(client, admin_headers):
    a = make_service(client, admin_headers, duration=60)
    b = make_service(client, admin_headers, duration=90)
    r = client.get("/bookings/slots", params={"date": str(upcoming(MON)), "service_ids": [a["id"], b["id"]]})
    assert r.json()["duration_minutes"] == 150
    assert r.json()["slots"][-1] == "15:30"


def test_slots_require_at_least_one_service(client):
    assert client.get("/bookings/slots", params={"date": str(upcoming(MON))}).status_code == 422


def test_past_dates_have_no_slots(client, admin_headers):
    svc = make_service(client, admin_headers)
    assert slots(client, now_local().date() - timedelta(days=1), svc["id"]) == []


def test_minimum_notice_hides_near_slots(client, admin_headers, monkeypatch):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    # pretend it's 10:00 that morning; default notice is 2 hours
    monkeypatch.setattr(booking_service, "now_local", lambda: datetime.combine(day, time(10, 0)))
    s = slots(client, day, svc["id"])
    assert s[0] == "12:00"


###############################
# clash detection

def test_booking_blocks_every_overlapping_slot(client, admin_headers):
    long_svc = make_service(client, admin_headers, duration=90)
    short_svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)

    assert book(client, [long_svc["id"]], day, "12:00").status_code == 200  # occupies 12:00-13:30

    s = slots(client, day, short_svc["id"])
    assert "11:00" in s          # ends 12:00 exactly, fine
    assert "11:30" not in s      # would run into the 12:00 booking
    assert "12:00" not in s and "13:00" not in s
    assert "13:30" in s          # starts when the booking ends, fine


def test_back_to_back_bookings_are_allowed(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)
    assert book(client, [svc["id"]], day, "12:00").status_code == 200
    assert book(client, [svc["id"]], day, "13:00", phone="0722000111").status_code == 200


def test_second_client_cannot_take_the_same_slot(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    assert book(client, [svc["id"]], day, "12:00").status_code == 200
    r = book(client, [svc["id"]], day, "12:00", phone="0722000111", name="Second Client")
    assert r.status_code == 409
    assert "no longer available" in r.json()["detail"]


def test_overlapping_start_is_rejected(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)
    assert book(client, [svc["id"]], day, "12:00").status_code == 200
    assert book(client, [svc["id"]], day, "12:30", phone="0722000111").status_code == 409


def test_cancelled_booking_frees_the_slot(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    booking = book(client, [svc["id"]], day, "12:00").json()["booking"]
    assert "12:00" not in slots(client, day, svc["id"])

    r = client.patch(f"/bookings/admin/{booking['id']}/status", headers=admin_headers,
                     json={"status": "cancelled", "reason": "Sick"})
    assert r.status_code == 200
    assert "12:00" in slots(client, day, svc["id"])


def test_buffer_setting_adds_gap_after_each_booking(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)
    assert client.patch("/schedule/admin/settings", headers=admin_headers, json={"buffer_minutes": 30}).status_code == 200
    book(client, [svc["id"]], day, "12:00")
    s = slots(client, day, svc["id"])
    assert "13:00" not in s       # inside the 30-minute cleanup gap
    assert "13:30" in s


def test_start_time_off_the_slot_grid_is_rejected(client, admin_headers):
    svc = make_service(client, admin_headers)
    assert book(client, [svc["id"]], upcoming(MON), "12:10").status_code == 409


def test_start_in_the_past_is_rejected(client, admin_headers):
    svc = make_service(client, admin_headers)
    yesterday = now_local().date() - timedelta(days=1)
    assert book(client, [svc["id"]], yesterday, "12:00").status_code == 409


###############################
# blocked time

def test_blocked_time_removes_slots(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)
    r = client.post("/schedule/admin/blocked-times", headers=admin_headers, json={
        "start_time": f"{day}T13:00:00", "end_time": f"{day}T14:00:00", "reason": "Lunch",
    })
    assert r.status_code == 200
    s = slots(client, day, svc["id"])
    assert "13:00" not in s and "12:30" not in s   # 12:30-13:30 would overlap lunch
    assert "12:00" in s and "14:00" in s


def test_blocking_time_reports_bookings_already_inside_it(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    booked = book(client, [svc["id"]], day, "10:00").json()["booking"]
    r = client.post("/schedule/admin/blocked-times", headers=admin_headers, json={
        "start_time": f"{day}T09:00:00", "end_time": f"{day}T12:00:00",
    })
    assert [b["id"] for b in r.json()["affected_bookings"]] == [booked["id"]]


def test_removing_a_block_restores_slots(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    block = client.post("/schedule/admin/blocked-times", headers=admin_headers, json={
        "start_time": f"{day}T00:00:00", "end_time": f"{day}T23:59:00",
    }).json()["blocked_time"]
    assert slots(client, day, svc["id"]) == []
    assert client.delete(f"/schedule/admin/blocked-times/{block['id']}", headers=admin_headers).status_code == 200
    assert slots(client, day, svc["id"]) != []


###############################
# creating a booking

def test_server_computes_price_and_duration_ignoring_client_values(client, admin_headers):
    a = make_service(client, admin_headers, price=1500, duration=60)
    b = make_service(client, admin_headers, price=500, duration=30)
    r = book(client, [a["id"], b["id"]], upcoming(MON), "10:00",
             total_price=1, price=1, total_duration_minutes=5, status="confirmed")
    assert r.status_code == 200
    booking = r.json()["booking"]
    assert booking["total_price"] == 2000
    assert booking["total_duration_minutes"] == 90
    assert booking["status"] == "pending"
    assert booking["end_time"].endswith("11:30:00")
    assert booking["reference"].startswith("DN-")


def test_duplicate_service_ids_count_once(client, admin_headers):
    svc = make_service(client, admin_headers, price=800, duration=45)
    booking = book(client, [svc["id"], svc["id"]], upcoming(MON), "10:00").json()["booking"]
    assert booking["total_price"] == 800 and len(booking["items"]) == 1


def test_price_snapshot_survives_later_price_change(client, admin_headers):
    svc = make_service(client, admin_headers, price=1000)
    booking = book(client, [svc["id"]], upcoming(MON), "10:00").json()["booking"]
    client.patch(f"/services/{svc['id']}", headers=admin_headers, json={"price": 9999})
    listed = client.get("/bookings/admin", headers=admin_headers,
                        params={"from_date": str(upcoming(MON)), "to_date": str(upcoming(MON))}).json()
    assert listed[0]["total_price"] == 1000


@pytest.mark.parametrize("raw", ["0712345678", "+254712345678", "254712345678", "0712 345 678", "712345678", "0112345678"])
def test_kenyan_phone_numbers_are_normalised(client, admin_headers, raw):
    svc = make_service(client, admin_headers)
    r = book(client, [svc["id"]], upcoming(MON), "10:00", phone=raw)
    assert r.status_code == 200
    assert r.json()["booking"]["customer_phone"] in ("254712345678", "254112345678")


@pytest.mark.parametrize("raw", ["12345", "0912345678", "abcdefghij", "+1 555 123 4567"])
def test_invalid_phone_numbers_are_rejected(client, admin_headers, raw):
    svc = make_service(client, admin_headers)
    assert book(client, [svc["id"]], upcoming(MON), "10:00", phone=raw).status_code == 422


def test_one_phone_cannot_hold_unlimited_upcoming_bookings(client, admin_headers):
    svc = make_service(client, admin_headers, duration=30)
    day = upcoming(MON)
    for hhmm in ("09:00", "10:00", "11:00"):
        assert book(client, [svc["id"]], day, hhmm).status_code == 200
    assert book(client, [svc["id"]], day, "12:00").status_code == 400


def test_booking_requires_name_and_services(client, admin_headers):
    svc = make_service(client, admin_headers)
    assert book(client, [], upcoming(MON), "10:00").status_code == 422
    assert book(client, [svc["id"]], upcoming(MON), "10:00", name="   ").status_code == 422


###############################
# WhatsApp

def _wa_text(url: str) -> str:
    return parse_qs(urlparse(url).query)["text"][0]


def test_booking_returns_whatsapp_link_to_dee_with_details(client, admin_headers):
    client.patch("/schedule/admin/settings", headers=admin_headers, json={"whatsapp_number": "254700111222"})
    svc = make_service(client, admin_headers, name="Gel polish", price=1500, duration=60)
    r = book(client, [svc["id"]], upcoming(MON), "12:00", notes="Short nails please").json()

    assert r["whatsapp_url"].startswith("https://wa.me/254700111222?text=")
    text = _wa_text(r["whatsapp_url"])
    assert r["booking"]["reference"] in text
    assert "Amina Wanjiku" in text and "Gel polish" in text
    assert "12:00 PM - 1:00 PM" in text and "KES 1,500" in text
    assert "Short nails please" in text


def test_no_whatsapp_link_until_number_is_set_but_booking_still_saved(client, admin_headers):
    svc = make_service(client, admin_headers)
    r = book(client, [svc["id"]], upcoming(MON), "12:00")
    assert r.status_code == 200
    assert r.json()["whatsapp_url"] is None
    assert r.json()["whatsapp_message"]


def test_whatsapp_number_must_be_digits_only(client, admin_headers):
    r = client.patch("/schedule/admin/settings", headers=admin_headers, json={"whatsapp_number": "+254 700"})
    assert r.status_code == 422


###############################
# admin: list, status, reschedule

def test_admin_endpoints_require_admin(client, user_headers):
    for method, path in [
        ("get", "/bookings/admin"),
        ("patch", "/bookings/admin/1/status"),
        ("post", "/bookings/admin/1/reschedule"),
        ("get", "/schedule/admin/settings"),
        ("get", "/schedule/admin/blocked-times"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path
        assert getattr(client, method)(path, headers=user_headers).status_code == 403, path


def test_admin_sees_who_booked_and_when_in_time_order(client, admin_headers):
    svc = make_service(client, admin_headers, duration=30)
    day = upcoming(MON)
    book(client, [svc["id"]], day, "14:00", name="Later Client", phone="0722000111")
    book(client, [svc["id"]], day, "10:00", name="Earlier Client", phone="0733000222")
    listed = client.get("/bookings/admin", headers=admin_headers,
                        params={"from_date": str(day), "to_date": str(day)}).json()
    assert [b["customer_name"] for b in listed] == ["Earlier Client", "Later Client"]
    assert listed[0]["customer_phone"] == "254733000222"


def test_admin_list_can_filter_by_status(client, admin_headers):
    svc = make_service(client, admin_headers, duration=30)
    day = upcoming(MON)
    b = book(client, [svc["id"]], day, "10:00").json()["booking"]
    book(client, [svc["id"]], day, "11:00", phone="0722000111")
    client.patch(f"/bookings/admin/{b['id']}/status", headers=admin_headers, json={"status": "confirmed"})
    r = client.get("/bookings/admin", headers=admin_headers,
                   params={"from_date": str(day), "to_date": str(day), "status": "confirmed"}).json()
    assert [x["id"] for x in r] == [b["id"]]


def test_confirm_returns_whatsapp_link_to_the_client(client, admin_headers):
    svc = make_service(client, admin_headers)
    b = book(client, [svc["id"]], upcoming(MON), "10:00").json()["booking"]
    r = client.patch(f"/bookings/admin/{b['id']}/status", headers=admin_headers, json={"status": "confirmed"}).json()
    assert r["booking"]["status"] == "confirmed"
    assert r["whatsapp_url"].startswith("https://wa.me/254712345678?text=")
    assert "confirmed" in _wa_text(r["whatsapp_url"])


def test_cancel_stores_reason_and_messages_client(client, admin_headers):
    svc = make_service(client, admin_headers)
    b = book(client, [svc["id"]], upcoming(MON), "10:00").json()["booking"]
    r = client.patch(f"/bookings/admin/{b['id']}/status", headers=admin_headers,
                     json={"status": "cancelled", "reason": "Stock delivery"}).json()
    assert r["booking"]["status"] == "cancelled"
    assert r["booking"]["cancel_reason"] == "Stock delivery"
    assert "Stock delivery" in _wa_text(r["whatsapp_url"])


def test_invalid_status_transitions_are_refused(client, admin_headers):
    svc = make_service(client, admin_headers)
    b = book(client, [svc["id"]], upcoming(MON), "10:00").json()["booking"]
    url = f"/bookings/admin/{b['id']}/status"
    assert client.patch(url, headers=admin_headers, json={"status": "completed"}).status_code == 400  # not confirmed yet
    client.patch(url, headers=admin_headers, json={"status": "cancelled"})
    assert client.patch(url, headers=admin_headers, json={"status": "confirmed"}).status_code == 400  # cancelled is final


def test_unknown_booking_is_404(client, admin_headers):
    assert client.patch("/bookings/admin/999999/status", headers=admin_headers, json={"status": "confirmed"}).status_code == 404
    assert client.post("/bookings/admin/999999/reschedule", headers=admin_headers,
                       json={"start_time": f"{upcoming(MON)}T10:00:00"}).status_code == 404


def test_reschedule_moves_booking_frees_old_slot_and_messages_client(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    b = book(client, [svc["id"]], day, "10:00").json()["booking"]

    r = client.post(f"/bookings/admin/{b['id']}/reschedule", headers=admin_headers,
                    json={"start_time": f"{day}T15:00:00"})
    assert r.status_code == 200
    body = r.json()
    assert body["booking"]["start_time"].startswith(f"{day}T15:00")
    assert body["booking"]["end_time"].startswith(f"{day}T16:00")
    assert "Mon" in _wa_text(body["whatsapp_url"]) and "3:00 PM" in _wa_text(body["whatsapp_url"])

    s = slots(client, day, svc["id"])
    assert "10:00" in s and "15:00" not in s


def test_reschedule_into_another_booking_is_refused(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    first = book(client, [svc["id"]], day, "10:00").json()["booking"]
    book(client, [svc["id"]], day, "14:00", phone="0722000111")
    r = client.post(f"/bookings/admin/{first['id']}/reschedule", headers=admin_headers,
                    json={"start_time": f"{day}T14:30:00"})
    assert r.status_code == 409


def test_booking_can_shift_into_its_own_old_time(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)
    b = book(client, [svc["id"]], day, "10:00").json()["booking"]
    r = client.post(f"/bookings/admin/{b['id']}/reschedule", headers=admin_headers,
                    json={"start_time": f"{day}T10:30:00"})
    assert r.status_code == 200   # overlaps only its own previous slot


def test_cannot_reschedule_into_blocked_time_or_the_past(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    b = book(client, [svc["id"]], day, "10:00").json()["booking"]
    client.post("/schedule/admin/blocked-times", headers=admin_headers,
                json={"start_time": f"{day}T15:00:00", "end_time": f"{day}T16:00:00"})
    assert client.post(f"/bookings/admin/{b['id']}/reschedule", headers=admin_headers,
                       json={"start_time": f"{day}T15:00:00"}).status_code == 409
    yesterday = now_local().date() - timedelta(days=1)
    assert client.post(f"/bookings/admin/{b['id']}/reschedule", headers=admin_headers,
                       json={"start_time": f"{yesterday}T10:00:00"}).status_code == 400


def test_cancelled_booking_cannot_be_rescheduled(client, admin_headers):
    svc = make_service(client, admin_headers)
    day = upcoming(MON)
    b = book(client, [svc["id"]], day, "10:00").json()["booking"]
    client.patch(f"/bookings/admin/{b['id']}/status", headers=admin_headers, json={"status": "cancelled"})
    assert client.post(f"/bookings/admin/{b['id']}/reschedule", headers=admin_headers,
                       json={"start_time": f"{day}T11:00:00"}).status_code == 400


###############################
# working hours & public info

def test_changing_working_hours_changes_slots(client, admin_headers):
    svc = make_service(client, admin_headers, duration=60)
    day = upcoming(MON)
    hours = client.get("/schedule/admin/working-hours", headers=admin_headers).json()
    for h in hours:
        if h["weekday"] == MON:
            h["open_time"], h["close_time"] = "10:00:00", "14:00:00"
    r = client.put("/schedule/admin/working-hours", headers=admin_headers, json={"days": hours})
    assert r.status_code == 200
    s = slots(client, day, svc["id"])
    assert s[0] == "10:00" and s[-1] == "13:00"


def test_working_hours_must_close_after_opening(client, admin_headers):
    r = client.put("/schedule/admin/working-hours", headers=admin_headers, json={"days": [
        {"weekday": 0, "is_open": True, "open_time": "18:00:00", "close_time": "09:00:00"},
    ]})
    assert r.status_code == 422


def test_public_info_exposes_hours_and_whatsapp_but_not_internal_settings(client, admin_headers):
    client.patch("/schedule/admin/settings", headers=admin_headers, json={"whatsapp_number": "254700111222", "buffer_minutes": 15})
    info = client.get("/schedule/info").json()
    assert info["salon_name"] == "Dee Nails"
    assert info["whatsapp_number"] == "254700111222"
    assert len(info["working_hours"]) == 7
    assert "buffer_minutes" not in info


###############################
# service photos

import io
import os

from PIL import Image
from core.config import settings


def _png(size=(1600, 1200), color=(200, 60, 120), fmt="PNG"):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, fmt)
    return buf.getvalue()


def upload(client, headers, service_id, data, name="photo.png", ctype="image/png"):
    return client.post(f"/services/{service_id}/image", headers=headers, files={"file": (name, data, ctype)})


def test_admin_uploads_photo_which_is_shrunk_and_served(client, admin_headers):
    svc = make_service(client, admin_headers)
    r = upload(client, admin_headers, svc["id"], _png())
    assert r.status_code == 200
    url = r.json()["image_url"]
    assert url.startswith("/uploads/services/") and url.endswith(".webp")

    served = client.get(url)
    assert served.status_code == 200
    img = Image.open(io.BytesIO(served.content))
    assert img.format == "WEBP" and max(img.size) <= 900
    assert client.get("/services/").json()[0]["image_url"] == url


def test_replacing_a_photo_deletes_the_old_file(client, admin_headers):
    svc = make_service(client, admin_headers)
    first = upload(client, admin_headers, svc["id"], _png()).json()["image_url"]
    second = upload(client, admin_headers, svc["id"], _png(color=(10, 10, 10)), name="b.jpg", ctype="image/jpeg").json()["image_url"]
    assert first != second
    assert not os.path.exists(os.path.join(settings.UPLOAD_DIR, "services", os.path.basename(first)))
    assert os.path.exists(os.path.join(settings.UPLOAD_DIR, "services", os.path.basename(second)))


def test_remove_photo(client, admin_headers):
    svc = make_service(client, admin_headers)
    url = upload(client, admin_headers, svc["id"], _png()).json()["image_url"]
    r = client.delete(f"/services/{svc['id']}/image", headers=admin_headers)
    assert r.status_code == 200 and r.json()["image_url"] is None
    assert client.get(url).status_code == 404


def test_non_image_files_are_rejected(client, admin_headers):
    svc = make_service(client, admin_headers)
    r = upload(client, admin_headers, svc["id"], b"<script>alert(1)</script>", name="evil.jpg", ctype="image/jpeg")
    assert r.status_code == 400
    gif = _png(fmt="GIF")
    assert upload(client, admin_headers, svc["id"], gif, name="a.gif", ctype="image/gif").status_code == 400


def test_oversized_upload_is_rejected(client, admin_headers, monkeypatch):
    svc = make_service(client, admin_headers)
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 0)
    assert upload(client, admin_headers, svc["id"], _png((50, 50))).status_code == 413


def test_photo_upload_requires_admin_and_a_real_service(client, admin_headers, user_headers):
    svc = make_service(client, admin_headers)
    assert upload(client, {}, svc["id"], _png()).status_code == 401
    assert upload(client, user_headers, svc["id"], _png()).status_code == 403
    assert upload(client, admin_headers, 999999, _png()).status_code == 404


def test_image_url_cannot_be_set_through_create_or_update(client, admin_headers):
    svc = make_service(client, admin_headers, image_url="https://evil.example/x.png")
    assert svc["image_url"] is None
    r = client.patch(f"/services/{svc['id']}", headers=admin_headers, json={"image_url": "https://evil.example/x.png"})
    assert r.json()["image_url"] is None


###############################
# client checks their own booking

def test_client_can_check_booking_with_reference_and_phone(client, admin_headers):
    svc = make_service(client, admin_headers)
    created = book(client, [svc["id"]], upcoming(MON), "10:00", notes="private note").json()["booking"]
    r = client.post("/bookings/lookup", json={"reference": created["reference"].lower(), "customer_phone": "0712 345 678"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "pending" and body["reference"] == created["reference"]
    assert "customer_phone" not in body and "notes" not in body    # nothing private comes back

    client.patch(f"/bookings/admin/{created['id']}/status", headers=admin_headers, json={"status": "confirmed"})
    assert client.post("/bookings/lookup", json={"reference": created["reference"], "customer_phone": "0712345678"}).json()["status"] == "confirmed"


def test_lookup_needs_both_reference_and_the_right_phone(client, admin_headers):
    svc = make_service(client, admin_headers)
    created = book(client, [svc["id"]], upcoming(MON), "10:00").json()["booking"]
    wrong_phone = client.post("/bookings/lookup", json={"reference": created["reference"], "customer_phone": "0799999999"})
    wrong_ref = client.post("/bookings/lookup", json={"reference": "DN-ZZZZZZ", "customer_phone": "0712345678"})
    assert wrong_phone.status_code == 404 and wrong_ref.status_code == 404
    assert wrong_phone.json() == wrong_ref.json()     # can't tell which half was wrong


def test_lookup_is_rate_limited(client, admin_headers):
    codes = [client.post("/bookings/lookup", json={"reference": "DN-AAAAAA", "customer_phone": "0712345678"}).status_code for _ in range(17)]
    assert codes[:15] == [404] * 15 and codes[15] == 429
