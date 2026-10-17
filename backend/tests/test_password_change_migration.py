import importlib.util
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_auth_version_migration_preserves_existing_accounts():
    source = Path(__file__).parents[1] / "migrations/versions/20261017_v48pwd01_user_auth_version.py"
    spec = importlib.util.spec_from_file_location("password_migration", source)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL)"))
        conn.execute(text("INSERT INTO users (password_hash) VALUES ('unchanged-test-hash')"))
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
            row = conn.execute(text("SELECT password_hash, auth_version FROM users")).one()
            assert tuple(row) == ("unchanged-test-hash", 0)
            migration.downgrade()
            assert "auth_version" not in {column["name"] for column in inspect(conn).get_columns("users")}
