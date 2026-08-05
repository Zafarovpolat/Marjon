import urllib.request
import urllib.error

url = "http://localhost:8000/api/v1/printers/print/summary"
req = urllib.request.Request(url, data=b"{}", method="POST", headers={"Content-Type": "application/json"})
try:
    urllib.request.urlopen(req, timeout=5)
    print("200 unexpected")
except urllib.error.HTTPError as e:
    # 401/403 = маршрут существует; 404/405 = сервер без новых изменений
    print("HTTP", e.code, e.read()[:200])
except Exception as e:
    print("ERR", e)
