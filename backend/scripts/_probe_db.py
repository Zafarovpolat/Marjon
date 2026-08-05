import sqlite3

db = sqlite3.connect(r"c:\Users\x\Desktop\Marjon\backend\dev.db")
users = ('79151c4675634ebfa51a29d0d99fe6fe', 'f95a50048adc4139992fa40a3b6b1d54')
tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
marks = ",".join("?" * len(users))

for t in tables:
    cols = [r[1] for r in db.execute(f"PRAGMA table_info({t})")]
    for c in cols:
        if "user" in c or c in ("created_by", "waiter_id", "cashier_id", "manager_id", "staff_id", "author_id"):
            try:
                n = db.execute(f"SELECT COUNT(*) FROM {t} WHERE {c} IN ({marks})", users).fetchone()[0]
            except sqlite3.OperationalError:
                continue
            if n:
                print(f"{t}.{c} -> {n} rows")
