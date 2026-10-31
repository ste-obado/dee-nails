def test_register_new_user(client):
    r = client.post("/auth/register", json={
        "name": "Steve", "email": "steve@test.com", "role": "user",
        "password": "password123", "confirm_password": "password123",
    })
    assert r.status_code == 200


def test_register_duplicate_email_rejected(client):
    payload = {"name": "A", "email": "dup@test.com", "role": "user",
               "password": "password123", "confirm_password": "password123"}
    client.post("/auth/register", json=payload)
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 409


def test_register_password_mismatch_rejected(client):
    r = client.post("/auth/register", json={
        "name": "A", "email": "b@test.com", "role": "user",
        "password": "password123", "confirm_password": "different",
    })
    assert r.status_code == 422


def test_login_success(client):
    client.post("/auth/register", json={
        "name": "A", "email": "login@test.com", "role": "user",
        "password": "password123", "confirm_password": "password123",
    })
    r = client.post("/auth/login", data={"username": "login@test.com", "password": "password123"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password_rejected(client):
    client.post("/auth/register", json={
        "name": "A", "email": "wrongpw@test.com", "role": "user",
        "password": "password123", "confirm_password": "password123",
    })
    r = client.post("/auth/login", data={"username": "wrongpw@test.com", "password": "nope"})
    assert r.status_code == 401


def test_logout_blacklists_token(client, user_headers):
    r = client.get("/users/me", headers=user_headers)
    assert r.status_code == 200  # token works before logout

    client.post("/auth/logout", headers=user_headers)

    r = client.get("/users/me", headers=user_headers)
    assert r.status_code == 401  # same token rejected after logout


def test_register_cannot_grant_admin_role(client):
    """
    Regression test for a real privilege-escalation bug: registration used
    to accept a client-supplied "role" field, so anyone could POST
    role="admin" and get an admin account. Every self-registered account
    must be a plain user, no matter what the request body claims.
    """
    r = client.post("/auth/register", json={
        "name": "Attacker", "email": "attacker@evil.com", "role": "admin",
        "password": "password123", "confirm_password": "password123",
    })
    assert r.status_code == 200

    r = client.post("/auth/login", data={"username": "attacker@evil.com", "password": "password123"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get("/bookings/admin", headers=headers)
    assert r.status_code == 403  # must NOT have gotten admin access
