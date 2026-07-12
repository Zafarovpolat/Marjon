"""Verify the kafe front-end contract end-to-end against the running API.
Logs in, then hits every endpoint the React pages call (esp. the ones that used
to 404/405). Prints a status matrix.
"""
import asyncio
import httpx

BASE = "http://127.0.0.1:8000/api/v1"
ADMIN = {"email": "admin@marjon.uz", "password": "Admin1234!"}


async def main():
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{BASE}/auth/login", json=ADMIN)
        token = r.json()["access_token"]
        c.headers["Authorization"] = f"Bearer {token}"

        # a product id (for DELETE) and a staff member (for PIN login)
        products = (await c.get(f"{BASE}/inventory/products")).json()
        prod_id = products[-1]["id"] if products else None
        staff = (await c.get(f"{BASE}/auth/staff-users")).json()
        waiter = next((s for s in staff if s["email"] == "waiter1@marjon.uz"), None)

        checks = [
            ("GET", "/auth/staff-users", None),
            ("GET", "/billing/balance", None),
            ("GET", "/crm/counterparties", None),
            ("GET", "/finance/transactions", None),
            ("GET", "/finance/transaction-categories", None),
            ("POST", "/finance/transaction-categories", {"name": "Продажи", "kind": "income"}),
            ("GET", "/reports/orders", None),
            ("GET", "/reports/waiters", None),
            ("GET", "/reports/tables", None),
            ("GET", "/reports/dishes", None),
            ("GET", "/reports/cancelled", None),
            ("GET", "/settings/organization", None),
            ("PATCH", "/settings/organization", {"currency": "UZS"}),
            ("GET", "/settings/units", None),
            ("GET", "/settings/payment-methods", None),
            ("POST", "/settings/payment-methods", {"name": "Наличные", "type": "cash"}),
            ("GET", "/settings/places", None),
            ("POST", "/support/tickets", {"phone": "+998901112233", "message": "Тест", "country": "UZ"}),
            # previously OK — sanity
            ("GET", "/analytics/dashboard", None),
            ("GET", "/pos/orders", None),
        ]

        print(f"\n{'METHOD':7}{'PATH':40}{'STATUS':8}INFO")
        print("-" * 78)
        ok = 0
        for method, path, body in checks:
            try:
                resp = await c.request(method, f"{BASE}{path}", json=body)
                sc = resp.status_code
            except Exception as e:
                print(f"{method:7}{path:40}{'ERR':8}{e}")
                continue
            info = ""
            try:
                data = resp.json()
                if isinstance(data, list):
                    info = f"{len(data)} items"
                elif isinstance(data, dict):
                    if "items" in data:
                        info = f"{len(data['items'])} items"
                    else:
                        info = ", ".join(list(data.keys())[:4])
            except Exception:
                info = resp.text[:40]
            mark = "OK" if sc < 400 else "FAIL"
            if sc < 400:
                ok += 1
            print(f"{method:7}{path:40}{sc:<8}{mark} {info}")

        # PIN login (unauthenticated flow)
        if waiter:
            r = await httpx.AsyncClient(timeout=30).post(
                f"{BASE}/auth/pin-login", json={"employee_id": waiter["id"], "pin": "1111"})
            print(f"{'POST':7}{'/auth/pin-login':40}{r.status_code:<8}"
                  f"{'OK token' if r.status_code == 200 else 'FAIL ' + r.text[:40]}")
            if r.status_code == 200:
                ok += 1

        # DELETE product (was 405)
        if prod_id:
            r = await c.delete(f"{BASE}/inventory/products/{prod_id}")
            print(f"{'DELETE':7}{'/inventory/products/{id}':40}{r.status_code:<8}"
                  f"{'OK' if r.status_code < 400 else 'FAIL'}")
            if r.status_code < 400:
                ok += 1

        print("-" * 78)
        print(f"PASSED: {ok}/{len(checks) + 2}")


if __name__ == "__main__":
    asyncio.run(main())
