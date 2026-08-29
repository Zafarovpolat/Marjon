"""Enforce tenant ownership for finance dictionaries and history.

Revision ID: bi05aown20
Revises: bi05bfin19
Create Date: 2026-08-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "bi05aown20"
down_revision: Union[str, None] = "bi05bfin19"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_C_TABLES = (
    "fin_payment_types",
    "fin_transaction_categories",
    "fin_templates",
)
_ALL_TABLES = _C_TABLES + ("fin_counterparties", "fin_history")


def _execute_batch(script: str) -> None:
    """Execute a SQL script one top-level statement at a time for asyncpg.

    Alembic's asyncpg connection prepares each call and therefore rejects
    multiple commands.  Dollar-quoted PL/pgSQL bodies must stay intact.
    """
    statements: list[str] = []
    start = 0
    index = 0
    single_quoted = False
    double_quoted = False
    dollar_tag: str | None = None
    while index < len(script):
        if dollar_tag is not None:
            if script.startswith(dollar_tag, index):
                index += len(dollar_tag)
                dollar_tag = None
            else:
                index += 1
            continue
        char = script[index]
        if single_quoted:
            if char == "'" and index + 1 < len(script) and script[index + 1] == "'":
                index += 2
            elif char == "'":
                single_quoted = False
                index += 1
            else:
                index += 1
            continue
        if double_quoted:
            if char == '"' and index + 1 < len(script) and script[index + 1] == '"':
                index += 2
            elif char == '"':
                double_quoted = False
                index += 1
            else:
                index += 1
            continue
        if char == "'":
            single_quoted = True
            index += 1
            continue
        if char == '"':
            double_quoted = True
            index += 1
            continue
        if char == "$":
            end = script.find("$", index + 1)
            if end != -1 and all(c.isalnum() or c == "_" for c in script[index + 1:end]):
                dollar_tag = script[index:end + 1]
                index = end + 1
                continue
        if char == ";":
            statement = script[start:index].strip()
            if statement:
                statements.append(statement)
            start = index + 1
        index += 1
    tail = script[start:].strip()
    if tail:
        statements.append(tail)
    for statement in statements:
        op.get_bind().exec_driver_sql(statement)


def _key_sql(entity: str, legacy: str, scope: str, scope_id: str) -> str:
    return (
        f"md5('bi05a:map:{entity}:' || {legacy}::text || ':' || {scope} || ':' || "
        f"coalesce({scope_id}::text, 'none'))"
    )


def _id_sql(entity: str, legacy: str, scope: str, scope_id: str) -> str:
    return (
        f"md5('bi05a:clone:{entity}:' || {legacy}::text || ':' || {scope} || ':' || "
        f"{scope_id}::text)::uuid"
    )


def _add_fk_not_valid(
    name: str,
    table: str,
    column: str,
    target_table: str,
    *,
    ondelete: str,
) -> None:
    op.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT {name} FOREIGN KEY ({column}) "
        f"REFERENCES {target_table}(id) ON DELETE {ondelete} NOT VALID"
    )
    op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")


def _add_columns_and_audit_table() -> None:
    op.add_column(
        "fin_transactions",
        sa.Column("finance_template_id", sa.Uuid(), nullable=True),
    )
    for table in _ALL_TABLES:
        op.add_column(table, sa.Column("scope_kind", sa.String(16), nullable=True))
        if table != "fin_history":
            op.add_column(table, sa.Column("company_id", sa.Uuid(), nullable=True))
            op.add_column(table, sa.Column("organization_id", sa.Uuid(), nullable=True))
    for table in _C_TABLES:
        op.add_column(table, sa.Column("source_template_id", sa.Uuid(), nullable=True))

    op.create_table(
        "finance_ownership_mappings",
        sa.Column("mapping_key", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("legacy_id", sa.Uuid(), nullable=False),
        sa.Column("target_scope", sa.String(16), nullable=False),
        sa.Column("target_scope_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_id", sa.Uuid(), nullable=True),
        sa.Column("resolution", sa.String(32), nullable=False),
        sa.Column("legacy_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mapping_key", name="uq_finance_ownership_mappings_mapping_key"),
    )
    op.create_index(
        "ix_finance_ownership_mappings_entity_type",
        "finance_ownership_mappings", ["entity_type"],
    )
    op.create_index(
        "ix_finance_ownership_mappings_legacy_id",
        "finance_ownership_mappings", ["legacy_id"],
    )
    op.create_index(
        "ix_finance_ownership_mappings_resolved_id",
        "finance_ownership_mappings", ["resolved_id"],
    )


def _counterparty_preflight() -> None:
    _execute_batch(
        """
        DO $$
        DECLARE ambiguous_count bigint;
        BEGIN
          WITH targets AS (
            SELECT DISTINCT counterparty_id AS legacy_id, 'company'::text AS scope_kind,
                            company_id AS scope_id
            FROM fin_transactions
            WHERE counterparty_id IS NOT NULL AND company_id IS NOT NULL
              AND organization_id IS NULL
            UNION
            SELECT DISTINCT counterparty_id, 'organization', organization_id
            FROM fin_transactions
            WHERE counterparty_id IS NOT NULL AND organization_id IS NOT NULL
              AND company_id IS NULL
          ), unsafe AS (
            SELECT legacy_id FROM targets GROUP BY legacy_id HAVING count(*) > 1
            UNION
            SELECT DISTINCT counterparty_id
            FROM fin_transactions
            WHERE counterparty_id IS NOT NULL
              AND (company_id IS NOT NULL) = (organization_id IS NOT NULL)
          )
          SELECT count(*) INTO ambiguous_count
          FROM unsafe JOIN fin_counterparties c ON c.id = unsafe.legacy_id
          WHERE coalesce(c.balance, 0) <> 0;

          IF ambiguous_count > 0 THEN
            RAISE EXCEPTION
              'BI-05A reconciliation required: % multi-owner Counterparty row(s) have non-zero balance',
              ambiguous_count;
          END IF;
        END $$;
        """
    )


def _payment_types() -> None:
    key = _key_sql("payment_type", "legacy_id", "target_scope", "target_scope_id")
    clone_id = _id_sql("payment_type", "legacy_id", "target_scope", "target_scope_id")
    _execute_batch(
        f"""
        WITH targets AS (
          SELECT DISTINCT payment_type_id AS legacy_id, 'company'::text AS target_scope,
                          company_id AS target_scope_id
          FROM fin_transactions
          WHERE payment_type_id IS NOT NULL AND company_id IS NOT NULL
            AND organization_id IS NULL
          UNION
          SELECT DISTINCT payment_type_id, 'organization', organization_id
          FROM fin_transactions
          WHERE payment_type_id IS NOT NULL AND organization_id IS NOT NULL
            AND company_id IS NULL
          UNION
          SELECT DISTINCT payment_type_id, 'company', company_id
          FROM halls WHERE payment_type_id IS NOT NULL
        ), resolved AS (
          SELECT *, count(*) OVER (PARTITION BY legacy_id) AS owner_count,
                 EXISTS(
                   SELECT 1 FROM fin_transactions unknown_tx
                   WHERE unknown_tx.payment_type_id = targets.legacy_id
                     AND (unknown_tx.company_id IS NOT NULL) =
                         (unknown_tx.organization_id IS NOT NULL)
                 ) AS has_unknown
          FROM targets
        )
        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT ({key})::uuid, {key}, 'payment_type', legacy_id, target_scope,
               target_scope_id,
               CASE WHEN owner_count = 1 AND NOT has_unknown THEN legacy_id ELSE {clone_id} END,
               CASE WHEN owner_count = 1 AND NOT has_unknown THEN 'assigned' ELSE 'cloned' END,
               jsonb_build_object(
                 'sort', p.sort, 'name', p.name, 'type', p.type,
                 'status', p.status, 'updated_at', p.updated_at
               )
        FROM resolved JOIN fin_payment_types p ON p.id = resolved.legacy_id;

        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT md5('bi05a:map:payment_type:' || p.id::text || ':legacy:none')::uuid,
               md5('bi05a:map:payment_type:' || p.id::text || ':legacy:none'),
               'payment_type', p.id, 'legacy', NULL, NULL, 'hidden', '{{}}'::jsonb
        FROM fin_payment_types p
        WHERE NOT EXISTS (
          SELECT 1 FROM finance_ownership_mappings m
          WHERE m.entity_type = 'payment_type' AND m.legacy_id = p.id
        );

        UPDATE fin_payment_types p
        SET scope_kind = m.target_scope,
            company_id = CASE WHEN m.target_scope = 'company' THEN m.target_scope_id END,
            organization_id = CASE WHEN m.target_scope = 'organization' THEN m.target_scope_id END
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'payment_type' AND m.resolution = 'assigned'
          AND p.id = m.legacy_id;

        INSERT INTO fin_payment_types
          (id, sort, name, type, status, created_at, updated_at,
           scope_kind, company_id, organization_id, source_template_id)
        SELECT m.resolved_id, p.sort, p.name, p.type, p.status, p.created_at, p.updated_at,
               m.target_scope,
               CASE WHEN m.target_scope = 'company' THEN m.target_scope_id END,
               CASE WHEN m.target_scope = 'organization' THEN m.target_scope_id END,
               NULL
        FROM finance_ownership_mappings m
        JOIN fin_payment_types p ON p.id = m.legacy_id
        WHERE m.entity_type = 'payment_type' AND m.resolution = 'cloned';

        UPDATE fin_transactions t SET payment_type_id = m.resolved_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'payment_type' AND t.payment_type_id = m.legacy_id
          AND ((m.target_scope = 'company' AND t.company_id = m.target_scope_id
                AND t.organization_id IS NULL)
            OR (m.target_scope = 'organization' AND t.organization_id = m.target_scope_id
                AND t.company_id IS NULL));

        UPDATE halls h SET payment_type_id = m.resolved_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'payment_type' AND h.payment_type_id = m.legacy_id
          AND m.target_scope = 'company' AND h.company_id = m.target_scope_id;

        UPDATE fin_payment_types p
        SET scope_kind = 'legacy', company_id = NULL, organization_id = NULL
        WHERE p.scope_kind IS NULL;
        """
    )


def _counterparties() -> None:
    key = _key_sql("counterparty", "legacy_id", "target_scope", "target_scope_id")
    clone_id = _id_sql("counterparty", "legacy_id", "target_scope", "target_scope_id")
    _execute_batch(
        f"""
        WITH targets AS (
          SELECT DISTINCT counterparty_id AS legacy_id, 'company'::text AS target_scope,
                          company_id AS target_scope_id
          FROM fin_transactions
          WHERE counterparty_id IS NOT NULL AND company_id IS NOT NULL
            AND organization_id IS NULL
          UNION
          SELECT DISTINCT counterparty_id, 'organization', organization_id
          FROM fin_transactions
          WHERE counterparty_id IS NOT NULL AND organization_id IS NOT NULL
            AND company_id IS NULL
        ), resolved AS (
          SELECT *, count(*) OVER (PARTITION BY legacy_id) AS owner_count,
                 EXISTS(
                   SELECT 1 FROM fin_transactions unknown_tx
                   WHERE unknown_tx.counterparty_id = targets.legacy_id
                     AND (unknown_tx.company_id IS NOT NULL) =
                         (unknown_tx.organization_id IS NOT NULL)
                 ) AS has_unknown
          FROM targets
        )
        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT ({key})::uuid, {key}, 'counterparty', legacy_id, target_scope,
               target_scope_id,
               CASE WHEN owner_count = 1 AND NOT has_unknown THEN legacy_id ELSE {clone_id} END,
               CASE WHEN owner_count = 1 AND NOT has_unknown THEN 'assigned' ELSE 'cloned' END,
               jsonb_build_object(
                 'full_name', c.full_name, 'phone', c.phone, 'balance', c.balance,
                 'type', c.type, 'deleted_at', c.deleted_at, 'updated_at', c.updated_at
               )
        FROM resolved JOIN fin_counterparties c ON c.id = legacy_id;

        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT md5('bi05a:map:counterparty:' || c.id::text || ':legacy:none')::uuid,
               md5('bi05a:map:counterparty:' || c.id::text || ':legacy:none'),
               'counterparty', c.id, 'legacy', NULL, NULL, 'hidden',
               jsonb_build_object('balance', c.balance)
        FROM fin_counterparties c
        WHERE NOT EXISTS (
          SELECT 1 FROM finance_ownership_mappings m
          WHERE m.entity_type = 'counterparty' AND m.legacy_id = c.id
        );

        UPDATE fin_counterparties c
        SET scope_kind = m.target_scope,
            company_id = CASE WHEN m.target_scope = 'company' THEN m.target_scope_id END,
            organization_id = CASE WHEN m.target_scope = 'organization' THEN m.target_scope_id END
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'counterparty' AND m.resolution = 'assigned'
          AND c.id = m.legacy_id;

        INSERT INTO fin_counterparties
          (id, full_name, phone, balance, type, created_at, updated_at, deleted_at,
           scope_kind, company_id, organization_id)
        SELECT m.resolved_id, c.full_name, c.phone, c.balance, c.type,
               c.created_at, c.updated_at, c.deleted_at, m.target_scope,
               CASE WHEN m.target_scope = 'company' THEN m.target_scope_id END,
               CASE WHEN m.target_scope = 'organization' THEN m.target_scope_id END
        FROM finance_ownership_mappings m
        JOIN fin_counterparties c ON c.id = m.legacy_id
        WHERE m.entity_type = 'counterparty' AND m.resolution = 'cloned';

        UPDATE fin_transactions t SET counterparty_id = m.resolved_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'counterparty' AND t.counterparty_id = m.legacy_id
          AND ((m.target_scope = 'company' AND t.company_id = m.target_scope_id
                AND t.organization_id IS NULL)
            OR (m.target_scope = 'organization' AND t.organization_id = m.target_scope_id
                AND t.company_id IS NULL));

        UPDATE fin_counterparties c
        SET scope_kind = 'legacy', company_id = NULL, organization_id = NULL
        WHERE c.scope_kind IS NULL;
        """
    )


def _categories() -> None:
    key = _key_sql("transaction_category", "legacy_id", "target_scope", "target_scope_id")
    clone_id = _id_sql("transaction_category", "legacy_id", "target_scope", "target_scope_id")
    _execute_batch(
        f"""
        WITH RECURSIVE category_targets(legacy_id, target_scope, target_scope_id) AS (
          SELECT DISTINCT category_id, 'company'::text, company_id
          FROM fin_transactions
          WHERE category_id IS NOT NULL AND company_id IS NOT NULL
            AND organization_id IS NULL
          UNION
          SELECT DISTINCT category_id, 'organization', organization_id
          FROM fin_transactions
          WHERE category_id IS NOT NULL AND organization_id IS NOT NULL
            AND company_id IS NULL
          UNION
          SELECT c.parent_id, t.target_scope, t.target_scope_id
          FROM category_targets t
          JOIN fin_transaction_categories c ON c.id = t.legacy_id
          WHERE c.parent_id IS NOT NULL
        ), resolved AS (
          SELECT *, count(*) OVER (PARTITION BY legacy_id) AS owner_count,
                 EXISTS(
                   SELECT 1 FROM fin_transactions unknown_tx
                   WHERE unknown_tx.category_id = category_targets.legacy_id
                     AND (unknown_tx.company_id IS NOT NULL) =
                         (unknown_tx.organization_id IS NOT NULL)
                 ) AS has_unknown
          FROM category_targets
        )
        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT ({key})::uuid, {key}, 'transaction_category', legacy_id,
               target_scope, target_scope_id,
               CASE WHEN owner_count = 1 AND NOT has_unknown THEN legacy_id ELSE {clone_id} END,
               CASE WHEN owner_count = 1 AND NOT has_unknown THEN 'assigned' ELSE 'cloned' END,
               jsonb_build_object(
                 'name', c.name, 'kind', c.kind, 'parent_id', c.parent_id,
                 'status', c.status, 'updated_at', c.updated_at
               )
        FROM resolved JOIN fin_transaction_categories c ON c.id = legacy_id;

        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT md5('bi05a:map:transaction_category:' || c.id::text || ':legacy:none')::uuid,
               md5('bi05a:map:transaction_category:' || c.id::text || ':legacy:none'),
               'transaction_category', c.id, 'legacy', NULL, NULL, 'hidden',
               jsonb_build_object('parent_id', c.parent_id)
        FROM fin_transaction_categories c
        WHERE NOT EXISTS (
          SELECT 1 FROM finance_ownership_mappings m
          WHERE m.entity_type = 'transaction_category' AND m.legacy_id = c.id
        );

        UPDATE fin_transaction_categories c
        SET scope_kind = m.target_scope,
            company_id = CASE WHEN m.target_scope = 'company' THEN m.target_scope_id END,
            organization_id = CASE WHEN m.target_scope = 'organization' THEN m.target_scope_id END
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'transaction_category' AND m.resolution = 'assigned'
          AND c.id = m.legacy_id;

        INSERT INTO fin_transaction_categories
          (id, name, kind, parent_id, status, created_at, updated_at,
           scope_kind, company_id, organization_id, source_template_id)
        SELECT m.resolved_id, c.name, c.kind, NULL, c.status, c.created_at, c.updated_at,
               m.target_scope,
               CASE WHEN m.target_scope = 'company' THEN m.target_scope_id END,
               CASE WHEN m.target_scope = 'organization' THEN m.target_scope_id END,
               NULL
        FROM finance_ownership_mappings m
        JOIN fin_transaction_categories c ON c.id = m.legacy_id
        WHERE m.entity_type = 'transaction_category' AND m.resolution = 'cloned';

        UPDATE fin_transaction_categories child
        SET parent_id = (
          SELECT parent_map.resolved_id
          FROM finance_ownership_mappings parent_map
          WHERE parent_map.entity_type = 'transaction_category'
            AND parent_map.legacy_id = NULLIF(child_map.legacy_metadata->>'parent_id', '')::uuid
            AND parent_map.target_scope = child_map.target_scope
            AND parent_map.target_scope_id = child_map.target_scope_id
          LIMIT 1
        )
        FROM finance_ownership_mappings child_map
        WHERE child_map.entity_type = 'transaction_category'
          AND child_map.resolution IN ('assigned', 'cloned')
          AND child.id = child_map.resolved_id;

        UPDATE fin_transactions t SET category_id = m.resolved_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type = 'transaction_category' AND t.category_id = m.legacy_id
          AND ((m.target_scope = 'company' AND t.company_id = m.target_scope_id
                AND t.organization_id IS NULL)
            OR (m.target_scope = 'organization' AND t.organization_id = m.target_scope_id
                AND t.company_id IS NULL));

        UPDATE fin_transaction_categories c
        SET scope_kind = 'legacy', company_id = NULL, organization_id = NULL,
            parent_id = NULL
        WHERE c.scope_kind IS NULL;
        """
    )


def _templates_and_history() -> None:
    _execute_batch(
        """
        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT md5('bi05a:map:finance_template:' || t.id::text || ':legacy:none')::uuid,
               md5('bi05a:map:finance_template:' || t.id::text || ':legacy:none'),
               'finance_template', t.id, 'legacy', NULL, NULL, 'hidden', '{}'::jsonb
        FROM fin_templates t;
        UPDATE fin_templates SET scope_kind = 'legacy', company_id = NULL,
                                 organization_id = NULL;

        INSERT INTO finance_ownership_mappings
          (id, mapping_key, entity_type, legacy_id, target_scope, target_scope_id,
           resolved_id, resolution, legacy_metadata)
        SELECT md5('bi05a:map:finance_history:' || h.id::text || ':' ||
                   CASE WHEN tx.company_id IS NOT NULL AND tx.organization_id IS NULL
                        THEN 'company'
                        WHEN tx.organization_id IS NOT NULL AND tx.company_id IS NULL
                        THEN 'organization' ELSE 'legacy' END || ':none')::uuid,
               md5('bi05a:map:finance_history:' || h.id::text || ':' ||
                   CASE WHEN tx.company_id IS NOT NULL AND tx.organization_id IS NULL
                        THEN 'company'
                        WHEN tx.organization_id IS NOT NULL AND tx.company_id IS NULL
                        THEN 'organization' ELSE 'legacy' END || ':none'),
               'finance_history', h.id,
               CASE WHEN tx.company_id IS NOT NULL AND tx.organization_id IS NULL THEN 'company'
                    WHEN tx.organization_id IS NOT NULL AND tx.company_id IS NULL THEN 'organization'
                    ELSE 'legacy' END,
               CASE WHEN tx.company_id IS NOT NULL AND tx.organization_id IS NULL THEN tx.company_id
                    WHEN tx.organization_id IS NOT NULL AND tx.company_id IS NULL THEN tx.organization_id END,
               h.id,
               CASE WHEN (tx.company_id IS NOT NULL) <> (tx.organization_id IS NOT NULL)
                    THEN 'assigned' ELSE 'hidden' END,
               jsonb_build_object('company_id', h.company_id,
                                  'organization_id', h.organization_id)
        FROM fin_history h LEFT JOIN fin_transactions tx ON tx.id = h.ref_id;

        UPDATE fin_history h
        SET scope_kind = CASE WHEN tx.company_id IS NOT NULL AND tx.organization_id IS NULL
                              THEN 'company'
                              WHEN tx.organization_id IS NOT NULL AND tx.company_id IS NULL
                              THEN 'organization' ELSE 'legacy' END,
            company_id = CASE WHEN tx.company_id IS NOT NULL AND tx.organization_id IS NULL
                              THEN tx.company_id END,
            organization_id = CASE WHEN tx.organization_id IS NOT NULL AND tx.company_id IS NULL
                                   THEN tx.organization_id END
        FROM fin_transactions tx
        WHERE tx.id = h.ref_id;

        UPDATE fin_history h SET scope_kind = 'legacy', company_id = NULL,
                                 organization_id = NULL
        WHERE h.scope_kind IS NULL;
        """
    )


def _constraints_indexes_and_triggers() -> None:
    for table in _ALL_TABLES:
        op.alter_column(table, "scope_kind", existing_type=sa.String(16), nullable=False)

    for table in ("fin_payment_types", "fin_transaction_categories", "fin_templates", "fin_counterparties"):
        _add_fk_not_valid(
            f"fk_{table}_company_id_companies", table, "company_id", "companies",
            ondelete="RESTRICT",
        )
        _add_fk_not_valid(
            f"fk_{table}_organization_id_organizations",
            table, "organization_id", "organizations", ondelete="RESTRICT",
        )
    _add_fk_not_valid(
        "fk_fin_history_company_id_companies",
        "fin_history", "company_id", "companies", ondelete="RESTRICT",
    )
    _add_fk_not_valid(
        "fk_fin_transactions_finance_template_id",
        "fin_transactions", "finance_template_id", "fin_templates",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_fin_transactions_finance_template_id",
        "fin_transactions", ["finance_template_id"],
    )
    for table in _C_TABLES:
        _add_fk_not_valid(
            f"fk_{table}_source_template_id",
            table, "source_template_id", table, ondelete="RESTRICT",
        )

    checks = {
        "fin_payment_types": "ck_fin_payment_types_ownership",
        "fin_transaction_categories": "ck_fin_transaction_categories_ownership",
        "fin_templates": "ck_fin_templates_ownership",
        "fin_counterparties": "ck_fin_counterparties_ownership",
        "fin_history": "ck_fin_history_ownership",
    }
    c_expr = """(
      (scope_kind = 'system' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL)
      OR (scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL)
      OR (scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL)
      OR (scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL AND source_template_id IS NULL)
    )"""
    b_expr = """(
      (scope_kind = 'company' AND company_id IS NOT NULL AND organization_id IS NULL)
      OR (scope_kind = 'organization' AND organization_id IS NOT NULL AND company_id IS NULL)
      OR (scope_kind = 'legacy' AND company_id IS NULL AND organization_id IS NULL)
    )"""
    for table, name in checks.items():
        expression = c_expr if table in _C_TABLES else b_expr
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK {expression} NOT VALID")
        op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")

    for table in _ALL_TABLES:
        op.create_index(f"ix_{table}_scope_kind", table, ["scope_kind"])
        op.create_index(f"ix_{table}_company", table, ["company_id"])
        op.create_index(f"ix_{table}_organization", table, ["organization_id"])
    for table in _C_TABLES:
        op.create_index(f"ix_{table}_source_template", table, ["source_template_id"])
        op.create_index(
            f"uq_{table}_company_source", table,
            ["company_id", "source_template_id"], unique=True,
            postgresql_where=sa.text("scope_kind = 'company' AND source_template_id IS NOT NULL"),
        )
        op.create_index(
            f"uq_{table}_organization_source", table,
            ["organization_id", "source_template_id"], unique=True,
            postgresql_where=sa.text("scope_kind = 'organization' AND source_template_id IS NOT NULL"),
        )

    op.execute(
        """
        CREATE FUNCTION fin_validate_template_source() RETURNS trigger AS $$
        DECLARE source_scope text;
        BEGIN
          IF NEW.source_template_id IS NULL THEN RETURN NEW; END IF;
          EXECUTE format('SELECT scope_kind FROM %I WHERE id = $1', TG_TABLE_NAME)
            INTO source_scope USING NEW.source_template_id;
          IF source_scope IS DISTINCT FROM 'system' THEN
            RAISE EXCEPTION 'source_template_id must reference a system template';
          END IF;
          IF NEW.scope_kind NOT IN ('company', 'organization') THEN
            RAISE EXCEPTION 'only tenant rows may copy a system template';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    for table in _C_TABLES:
        op.execute(
            f"""CREATE TRIGGER trg_{table}_template_source
            BEFORE INSERT OR UPDATE OF source_template_id, scope_kind ON {table}
            FOR EACH ROW EXECUTE FUNCTION fin_validate_template_source()"""
        )

    _execute_batch(
        """
        CREATE FUNCTION fin_validate_category_tree() RETURNS trigger AS $$
        DECLARE parent_row fin_transaction_categories%ROWTYPE;
                source_parent uuid;
                parent_source uuid;
                cycle_found boolean;
        BEGIN
          IF NEW.parent_id IS NULL THEN
            IF NEW.source_template_id IS NOT NULL THEN
              SELECT parent_id INTO source_parent FROM fin_transaction_categories
              WHERE id = NEW.source_template_id;
              IF source_parent IS NOT NULL THEN
                RAISE EXCEPTION 'category copy must copy its source parent';
              END IF;
            END IF;
            RETURN NEW;
          END IF;
          IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'category parent cycle'; END IF;
          SELECT * INTO parent_row FROM fin_transaction_categories WHERE id = NEW.parent_id;
          IF NOT FOUND OR parent_row.scope_kind IS DISTINCT FROM NEW.scope_kind
             OR parent_row.company_id IS DISTINCT FROM NEW.company_id
             OR parent_row.organization_id IS DISTINCT FROM NEW.organization_id THEN
            RAISE EXCEPTION 'category parent must have identical ownership scope';
          END IF;
          IF NEW.source_template_id IS NOT NULL THEN
            SELECT parent_id INTO source_parent FROM fin_transaction_categories
            WHERE id = NEW.source_template_id;
            parent_source := parent_row.source_template_id;
            IF source_parent IS NULL OR parent_source IS DISTINCT FROM source_parent THEN
              RAISE EXCEPTION 'category copy parent must copy the source parent';
            END IF;
          END IF;
          WITH RECURSIVE ancestors(id, parent_id) AS (
            SELECT id, parent_id FROM fin_transaction_categories WHERE id = NEW.parent_id
            UNION
            SELECT c.id, c.parent_id FROM fin_transaction_categories c
            JOIN ancestors a ON c.id = a.parent_id
          )
          SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;
          IF cycle_found THEN RAISE EXCEPTION 'category parent cycle'; END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_fin_transaction_categories_tree
        BEFORE INSERT OR UPDATE OF parent_id, scope_kind, company_id, organization_id,
                                   source_template_id
        ON fin_transaction_categories
        FOR EACH ROW EXECUTE FUNCTION fin_validate_category_tree();
        """
    )

    _execute_batch(
        """
        CREATE FUNCTION fin_validate_transaction_references() RETURNS trigger AS $$
        DECLARE ok boolean;
        BEGIN
          IF (NEW.company_id IS NOT NULL) = (NEW.organization_id IS NOT NULL) THEN
            RAISE EXCEPTION 'finance transaction must have exactly one tenant owner';
          END IF;
          IF NEW.payment_type_id IS NOT NULL THEN
            SELECT EXISTS(SELECT 1 FROM fin_payment_types p WHERE p.id = NEW.payment_type_id
              AND (p.scope_kind = 'system'
                OR (NEW.company_id IS NOT NULL AND p.scope_kind = 'company' AND p.company_id = NEW.company_id)
                OR (NEW.organization_id IS NOT NULL AND p.scope_kind = 'organization'
                    AND p.organization_id = NEW.organization_id))) INTO ok;
            IF NOT ok THEN RAISE EXCEPTION 'payment type is outside transaction scope'; END IF;
          END IF;
          IF NEW.category_id IS NOT NULL THEN
            SELECT EXISTS(SELECT 1 FROM fin_transaction_categories c WHERE c.id = NEW.category_id
              AND (c.scope_kind = 'system'
                OR (NEW.company_id IS NOT NULL AND c.scope_kind = 'company' AND c.company_id = NEW.company_id)
                OR (NEW.organization_id IS NOT NULL AND c.scope_kind = 'organization'
                    AND c.organization_id = NEW.organization_id))) INTO ok;
            IF NOT ok THEN RAISE EXCEPTION 'category is outside transaction scope'; END IF;
          END IF;
          IF NEW.counterparty_id IS NOT NULL THEN
            SELECT EXISTS(SELECT 1 FROM fin_counterparties c WHERE c.id = NEW.counterparty_id
              AND ((NEW.company_id IS NOT NULL AND c.scope_kind = 'company' AND c.company_id = NEW.company_id)
                OR (NEW.organization_id IS NOT NULL AND c.scope_kind = 'organization'
                    AND c.organization_id = NEW.organization_id))) INTO ok;
            IF NOT ok THEN RAISE EXCEPTION 'counterparty is outside transaction scope'; END IF;
          END IF;
          IF NEW.finance_template_id IS NOT NULL THEN
            SELECT EXISTS(SELECT 1 FROM fin_templates f WHERE f.id = NEW.finance_template_id
              AND (f.scope_kind = 'system'
                OR (NEW.company_id IS NOT NULL AND f.scope_kind = 'company' AND f.company_id = NEW.company_id)
                OR (NEW.organization_id IS NOT NULL AND f.scope_kind = 'organization'
                    AND f.organization_id = NEW.organization_id))) INTO ok;
            IF NOT ok THEN RAISE EXCEPTION 'finance template is outside transaction scope'; END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_fin_transactions_scope_references
        BEFORE INSERT OR UPDATE OF company_id, organization_id, payment_type_id,
                                   category_id, counterparty_id, finance_template_id
        ON fin_transactions
        FOR EACH ROW EXECUTE FUNCTION fin_validate_transaction_references();
        """
    )

    _execute_batch(
        """
        CREATE FUNCTION fin_validate_hall_payment_type() RETURNS trigger AS $$
        DECLARE ok boolean;
        BEGIN
          IF NEW.payment_type_id IS NULL THEN RETURN NEW; END IF;
          SELECT EXISTS(SELECT 1 FROM fin_payment_types p WHERE p.id = NEW.payment_type_id
            AND (p.scope_kind = 'system'
              OR (p.scope_kind = 'company' AND p.company_id = NEW.company_id))) INTO ok;
          IF NOT ok THEN RAISE EXCEPTION 'payment type is outside hall company scope'; END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_halls_payment_type_scope
        BEFORE INSERT OR UPDATE OF company_id, payment_type_id ON halls
        FOR EACH ROW EXECUTE FUNCTION fin_validate_hall_payment_type();
        """
    )

    _execute_batch(
        """
        CREATE FUNCTION fin_inherit_history_scope() RETURNS trigger AS $$
        DECLARE tx_company uuid; tx_organization uuid;
        BEGIN
          IF NEW.scope_kind = 'legacy' THEN
            NEW.company_id := NULL; NEW.organization_id := NULL; RETURN NEW;
          END IF;
          IF NEW.ref_id IS NULL THEN RAISE EXCEPTION 'tenant finance history requires ref_id'; END IF;
          SELECT company_id, organization_id INTO tx_company, tx_organization
          FROM fin_transactions WHERE id = NEW.ref_id;
          IF NOT FOUND OR (tx_company IS NOT NULL) = (tx_organization IS NOT NULL) THEN
            RAISE EXCEPTION 'finance history source transaction has no valid tenant scope';
          END IF;
          IF tx_company IS NOT NULL THEN
            NEW.scope_kind := 'company'; NEW.company_id := tx_company; NEW.organization_id := NULL;
          ELSE
            NEW.scope_kind := 'organization'; NEW.company_id := NULL;
            NEW.organization_id := tx_organization;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_fin_history_inherit_scope
        BEFORE INSERT OR UPDATE OF ref_id, scope_kind, company_id, organization_id
        ON fin_history FOR EACH ROW EXECUTE FUNCTION fin_inherit_history_scope();
        """
    )


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-05A finance ownership migration requires PostgreSQL")
    _counterparty_preflight()
    _add_columns_and_audit_table()
    _payment_types()
    _counterparties()
    _categories()
    _templates_and_history()
    _constraints_indexes_and_triggers()


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("BI-05A finance ownership migration requires PostgreSQL")
    for trigger, table in (
        ("trg_fin_history_inherit_scope", "fin_history"),
        ("trg_halls_payment_type_scope", "halls"),
        ("trg_fin_transactions_scope_references", "fin_transactions"),
        ("trg_fin_transaction_categories_tree", "fin_transaction_categories"),
        ("trg_fin_payment_types_template_source", "fin_payment_types"),
        ("trg_fin_transaction_categories_template_source", "fin_transaction_categories"),
        ("trg_fin_templates_template_source", "fin_templates"),
    ):
        op.execute(f"DROP TRIGGER {trigger} ON {table}")
    for function in (
        "fin_inherit_history_scope", "fin_validate_hall_payment_type",
        "fin_validate_transaction_references", "fin_validate_category_tree",
        "fin_validate_template_source",
    ):
        op.execute(f"DROP FUNCTION {function}()")
    for table, name in (
        ("fin_payment_types", "ck_fin_payment_types_ownership"),
        ("fin_transaction_categories", "ck_fin_transaction_categories_ownership"),
        ("fin_templates", "ck_fin_templates_ownership"),
        ("fin_counterparties", "ck_fin_counterparties_ownership"),
        ("fin_history", "ck_fin_history_ownership"),
    ):
        op.drop_constraint(name, table, type_="check")

    _execute_batch(
        """
        DO $$
        DECLARE unmapped bigint; changed_balance bigint; changed_clones bigint;
        BEGIN
          SELECT count(*) INTO unmapped FROM (
            SELECT p.id FROM fin_payment_types p WHERE p.scope_kind <> 'legacy'
              AND NOT EXISTS (SELECT 1 FROM finance_ownership_mappings m
                              WHERE m.entity_type='payment_type' AND m.resolved_id=p.id)
            UNION ALL
            SELECT c.id FROM fin_transaction_categories c WHERE c.scope_kind <> 'legacy'
              AND NOT EXISTS (SELECT 1 FROM finance_ownership_mappings m
                              WHERE m.entity_type='transaction_category' AND m.resolved_id=c.id)
            UNION ALL
            SELECT t.id FROM fin_templates t WHERE t.scope_kind <> 'legacy'
              AND NOT EXISTS (SELECT 1 FROM finance_ownership_mappings m
                              WHERE m.entity_type='finance_template' AND m.resolved_id=t.id)
            UNION ALL
            SELECT c.id FROM fin_counterparties c WHERE c.scope_kind <> 'legacy'
              AND NOT EXISTS (SELECT 1 FROM finance_ownership_mappings m
                              WHERE m.entity_type='counterparty' AND m.resolved_id=c.id)
            UNION ALL
            SELECT h.id FROM fin_history h WHERE h.scope_kind <> 'legacy'
              AND NOT EXISTS (SELECT 1 FROM finance_ownership_mappings m
                              WHERE m.entity_type='finance_history' AND m.resolved_id=h.id)
          ) rows;
          IF unmapped > 0 THEN
            RAISE EXCEPTION 'BI-05A downgrade unsafe: % post-migration finance row(s) exist', unmapped;
          END IF;
          SELECT count(*) INTO changed_clones FROM (
            SELECT m.mapping_key
            FROM finance_ownership_mappings m
            LEFT JOIN fin_payment_types p ON p.id=m.resolved_id
            WHERE m.entity_type='payment_type' AND m.resolution='cloned'
              AND (p.id IS NULL
                OR p.sort IS DISTINCT FROM (m.legacy_metadata->>'sort')::integer
                OR p.name IS DISTINCT FROM m.legacy_metadata->>'name'
                OR p.type IS DISTINCT FROM m.legacy_metadata->>'type'
                OR p.status IS DISTINCT FROM (m.legacy_metadata->>'status')::boolean
                OR p.updated_at IS DISTINCT FROM (m.legacy_metadata->>'updated_at')::timestamptz)
            UNION ALL
            SELECT m.mapping_key
            FROM finance_ownership_mappings m
            LEFT JOIN fin_transaction_categories c ON c.id=m.resolved_id
            WHERE m.entity_type='transaction_category' AND m.resolution='cloned'
              AND (c.id IS NULL
                OR c.name IS DISTINCT FROM m.legacy_metadata->>'name'
                OR c.kind IS DISTINCT FROM m.legacy_metadata->>'kind'
                OR c.status IS DISTINCT FROM (m.legacy_metadata->>'status')::boolean
                OR c.updated_at IS DISTINCT FROM (m.legacy_metadata->>'updated_at')::timestamptz
                OR c.parent_id IS DISTINCT FROM (
                  SELECT parent_map.resolved_id
                  FROM finance_ownership_mappings parent_map
                  WHERE parent_map.entity_type='transaction_category'
                    AND parent_map.legacy_id=NULLIF(m.legacy_metadata->>'parent_id','')::uuid
                    AND parent_map.target_scope=m.target_scope
                    AND parent_map.target_scope_id=m.target_scope_id
                  LIMIT 1
                ))
            UNION ALL
            SELECT m.mapping_key
            FROM finance_ownership_mappings m
            LEFT JOIN fin_counterparties c ON c.id=m.resolved_id
            WHERE m.entity_type='counterparty' AND m.resolution='cloned'
              AND (c.id IS NULL
                OR c.full_name IS DISTINCT FROM m.legacy_metadata->>'full_name'
                OR c.phone IS DISTINCT FROM m.legacy_metadata->>'phone'
                OR c.balance IS DISTINCT FROM (m.legacy_metadata->>'balance')::numeric
                OR c.type IS DISTINCT FROM m.legacy_metadata->>'type'
                OR c.deleted_at IS DISTINCT FROM (m.legacy_metadata->>'deleted_at')::timestamptz
                OR c.updated_at IS DISTINCT FROM (m.legacy_metadata->>'updated_at')::timestamptz)
          ) changed;
          IF changed_clones > 0 THEN
            RAISE EXCEPTION 'BI-05A downgrade unsafe: % cloned finance row(s) changed or disappeared',
              changed_clones;
          END IF;
          SELECT count(*) INTO changed_balance
          FROM finance_ownership_mappings m
          JOIN fin_counterparties c ON c.id=m.resolved_id
          WHERE m.entity_type='counterparty' AND m.resolution='cloned'
            AND c.balance IS DISTINCT FROM (m.legacy_metadata->>'balance')::numeric;
          IF changed_balance > 0 THEN
            RAISE EXCEPTION 'BI-05A downgrade unsafe: cloned Counterparty balances changed';
          END IF;
        END $$;

        UPDATE fin_transactions t SET payment_type_id=m.legacy_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type='payment_type' AND t.payment_type_id=m.resolved_id;
        UPDATE halls h SET payment_type_id=m.legacy_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type='payment_type' AND h.payment_type_id=m.resolved_id;
        UPDATE fin_transactions t SET category_id=m.legacy_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type='transaction_category' AND t.category_id=m.resolved_id;
        UPDATE fin_transactions t SET counterparty_id=m.legacy_id
        FROM finance_ownership_mappings m
        WHERE m.entity_type='counterparty' AND t.counterparty_id=m.resolved_id;

        UPDATE fin_transaction_categories c
        SET parent_id=NULLIF(m.legacy_metadata->>'parent_id','')::uuid
        FROM finance_ownership_mappings m
        WHERE m.entity_type='transaction_category' AND c.id=m.legacy_id;
        UPDATE fin_history h
        SET company_id=NULLIF(m.legacy_metadata->>'company_id','')::uuid,
            organization_id=NULLIF(m.legacy_metadata->>'organization_id','')::uuid
        FROM finance_ownership_mappings m
        WHERE m.entity_type='finance_history' AND h.id=m.legacy_id;

        DELETE FROM fin_payment_types p USING finance_ownership_mappings m
        WHERE m.entity_type='payment_type' AND m.resolution='cloned' AND p.id=m.resolved_id;
        DELETE FROM fin_transaction_categories c USING finance_ownership_mappings m
        WHERE m.entity_type='transaction_category' AND m.resolution='cloned' AND c.id=m.resolved_id;
        DELETE FROM fin_counterparties c USING finance_ownership_mappings m
        WHERE m.entity_type='counterparty' AND m.resolution='cloned' AND c.id=m.resolved_id;
        """
    )

    for table in _C_TABLES:
        op.drop_index(f"uq_{table}_organization_source", table_name=table)
        op.drop_index(f"uq_{table}_company_source", table_name=table)
        op.drop_index(f"ix_{table}_source_template", table_name=table)
    for table in reversed(_ALL_TABLES):
        op.drop_index(f"ix_{table}_organization", table_name=table)
        op.drop_index(f"ix_{table}_company", table_name=table)
        op.drop_index(f"ix_{table}_scope_kind", table_name=table)

    for table in reversed(_C_TABLES):
        op.drop_constraint(f"fk_{table}_source_template_id", table, type_="foreignkey")
    op.drop_constraint("fk_fin_history_company_id_companies", "fin_history", type_="foreignkey")
    op.drop_index("ix_fin_transactions_finance_template_id", table_name="fin_transactions")
    op.drop_constraint(
        "fk_fin_transactions_finance_template_id",
        "fin_transactions",
        type_="foreignkey",
    )
    for table in reversed(("fin_payment_types", "fin_transaction_categories", "fin_templates", "fin_counterparties")):
        op.drop_constraint(f"fk_{table}_organization_id_organizations", table, type_="foreignkey")
        op.drop_constraint(f"fk_{table}_company_id_companies", table, type_="foreignkey")

    for table in reversed(_C_TABLES):
        op.drop_column(table, "source_template_id")
    for table in reversed(_ALL_TABLES):
        if table != "fin_history":
            op.drop_column(table, "organization_id")
            op.drop_column(table, "company_id")
        op.drop_column(table, "scope_kind")
    op.drop_column("fin_transactions", "finance_template_id")
    op.drop_table("finance_ownership_mappings")
