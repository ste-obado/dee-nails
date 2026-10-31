def test_register_rate_limit_kicks_in(client):
    for i in range(5):
        r = client.post("/auth/register", json={
            "name": f"U{i}", "email": f"limit{i}@test.com", "role": "user",
            "password": "password123", "confirm_password": "password123",
        })
        assert r.status_code == 200

    r = client.post("/auth/register", json={
        "name": "Over limit", "email": "over@test.com", "role": "user",
        "password": "password123", "confirm_password": "password123",
    })
    assert r.status_code == 429


def test_cors_allows_configured_origin_only(client):
    r = client.options("/services/", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
    })
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"

    r = client.options("/services/", headers={
        "Origin": "https://evil.com",
        "Access-Control-Request-Method": "GET",
    })
    assert r.headers.get("access-control-allow-origin") is None


def test_security_headers_present(client):
    r = client.get("/")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"
