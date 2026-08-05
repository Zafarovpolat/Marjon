"""Удалить кладовщика и курьера: пользователей, их роли и назначения.

Использование: cd backend && python scripts/remove_warehouse_courier.py
Безопасен для повторного запуска. Авторство складских документов (created_by)
переносится на менеджера; привязки employees/couriers удаляются.
"""
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "dev.db"

# Таблицы, где created_by указывает на удаляемых пользователей — авторство
# переносим на менеджера, чтобы складские документы не остались сиротами.
REASSIGN_TABLES = [
    "stock_movements",
    "purchase_documents",
    "transfer_documents",
    "inventory_checks",
    "write_off_documents",
]
# Таблицы-привязки: строки с удаляемыми пользователями просто убираем.
DELETE_TABLES = ["user_roles", "employees", "couriers"]


def main() -> None:
    db = sqlite3.connect(DB)
    cur = db.cursor()

    cur.execute("SELECT id FROM roles WHERE slug IN ('warehouse', 'courier')")
    role_ids = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
        "WHERE r.slug IN ('warehouse', 'courier')"
    )
    user_ids = [r[0] for r in cur.fetchall()]
    print(f"Ролей: {len(role_ids)}, пользователей к удалению: {len(user_ids)}")

    if user_ids:
        umarks = ",".join("?" * len(user_ids))

        # Новый автор документов — первый менеджер компании
        cur.execute(
            "SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
            "WHERE r.slug = 'manager' LIMIT 1"
        )
        row = cur.fetchone()
        manager_id = row[0] if row else None

        for table in REASSIGN_TABLES:
            try:
                if manager_id:
                    cur.execute(
                        f"UPDATE {table} SET created_by = ? WHERE created_by IN ({umarks})",
                        [manager_id, *user_ids],
                    )
                else:
                    cur.execute(
                        f"UPDATE {table} SET created_by = NULL WHERE created_by IN ({umarks})",
                        user_ids,
                    )
                if cur.rowcount:
                    print(f"  {table}.created_by: перенесено {cur.rowcount}")
            except sqlite3.OperationalError:
                pass  # таблицы может не быть в конкретной базе

        for table in DELETE_TABLES:
            col = "user_id" if table != "user_roles" else "user_id"
            try:
                cur.execute(f"DELETE FROM {table} WHERE {col} IN ({umarks})", user_ids)
                if cur.rowcount:
                    print(f"  {table}: удалено {cur.rowcount}")
            except sqlite3.OperationalError:
                pass

        cur.execute(f"DELETE FROM users WHERE id IN ({umarks})", user_ids)
        print(f"  users: удалено {cur.rowcount}")

    if role_ids:
        marks = ",".join("?" * len(role_ids))
        cur.execute(f"DELETE FROM role_permissions WHERE role_id IN ({marks})", role_ids)
        cur.execute(f"DELETE FROM roles WHERE id IN ({marks})", role_ids)
        print(f"  roles: удалено {cur.rowcount}")

    db.commit()
    db.close()
    print("Готово.")


if __name__ == "__main__":
    main()
