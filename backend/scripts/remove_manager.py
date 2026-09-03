"""Удалить менеджера из базы: пользователей с ролью manager, саму роль и её права.

Использование: cd backend && python scripts/remove_manager.py
Безопасен для повторного запуска.

Все ссылки на менеджера переносятся на владельца (первый пользователь с ролью
owner); если владельца нет — обнуляются. Собственные строки менеджера в
таблицах-привязках (роли, организации, refresh-токены, сотрудник) удаляются.

Колонки, ссылающиеся на users, вычисляются динамически через PRAGMA
foreign_key_list — не полагаемся на жёсткий список таблиц, чтобы ничего не
осталось «сиротой» при изменении схемы.
"""
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "dev.db"

# Таблицы, где строки — это собственная идентичность/привязки менеджера:
# их не переносим на владельца, а удаляем.
DROP_TABLES = {"user_roles", "user_organizations", "refresh_tokens", "employees"}


def main() -> None:
    db = sqlite3.connect(DB)
    cur = db.cursor()

    cur.execute("SELECT id FROM roles WHERE slug = 'manager'")
    role_ids = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
        "WHERE r.slug = 'manager'"
    )
    user_ids = [r[0] for r in cur.fetchall()]
    print(f"Ролей manager: {len(role_ids)}, пользователей к удалению: {len(user_ids)}")

    if not user_ids and not role_ids:
        print("Менеджеров нет — база уже чистая.")
        db.close()
        return

    if user_ids:
        umarks = ",".join("?" * len(user_ids))

        # Новый владелец ссылок — первый пользователь с ролью owner,
        # который сам не входит в список удаляемых.
        cur.execute(
            f"SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
            f"WHERE r.slug = 'owner' AND ur.user_id NOT IN ({umarks}) LIMIT 1",
            user_ids,
        )
        row = cur.fetchone()
        owner_id = row[0] if row else None
        print(f"Перенос ссылок на: {owner_id or 'NULL (владелец не найден)'}")

        # Все таблицы базы
        tables = [
            r[0]
            for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        ]

        for table in tables:
            if table.startswith("sqlite_") or table == "users":
                continue
            try:
                fks = cur.execute(f"PRAGMA foreign_key_list({table})").fetchall()
            except sqlite3.OperationalError:
                continue
            # fk: (id, seq, table, from, to, on_update, on_delete, match)
            user_cols = [fk[3] for fk in fks if fk[2] == "users"]
            if not user_cols:
                continue

            for col in user_cols:
                try:
                    if table in DROP_TABLES:
                        cur.execute(
                            f"DELETE FROM {table} WHERE {col} IN ({umarks})", user_ids
                        )
                        if cur.rowcount:
                            print(f"  {table}.{col}: удалено {cur.rowcount}")
                    elif owner_id:
                        cur.execute(
                            f"UPDATE {table} SET {col} = ? WHERE {col} IN ({umarks})",
                            [owner_id, *user_ids],
                        )
                        if cur.rowcount:
                            print(f"  {table}.{col}: перенесено {cur.rowcount}")
                    else:
                        cur.execute(
                            f"UPDATE {table} SET {col} = NULL WHERE {col} IN ({umarks})",
                            user_ids,
                        )
                        if cur.rowcount:
                            print(f"  {table}.{col}: обнулено {cur.rowcount}")
                except (sqlite3.OperationalError, sqlite3.IntegrityError) as e:
                    print(f"  [skip] {table}.{col}: {e}")

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
