"""
Вебхуки платёжных провайдеров: Click, Payme, Uzum.

Монтируются БЕЗ JWT — провайдеры вызывают нас напрямую.
Верификация через подписи / Basic Auth.
"""
from __future__ import annotations

import base64
import hashlib
import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure.database.session import get_db
from app.modules.payments.models import Payment
from app.modules.payments.service import record_fiscal_and_audit
from app.modules.pos.models import Order

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments/webhooks", tags=["payment-webhooks"])


# ═══════════════════════════════════════════════════════════════════════════════
#  Click (2-фазный, form data: action=0 prepare, action=1 complete)
# ═══════════════════════════════════════════════════════════════════════════════

def _click_sign(click_trans_id, service_id, secret, merchant_trans_id, amount, action, sign_time):
    raw = f"{click_trans_id}{service_id}{secret}{merchant_trans_id}{amount}{action}{sign_time}"
    return hashlib.md5(raw.encode()).hexdigest()


@router.post("/click")
async def click_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    click_trans_id = form.get("click_trans_id", "")
    service_id = form.get("service_id", "")
    merchant_trans_id = form.get("merchant_trans_id", "")
    amount = form.get("amount", "0")
    action = form.get("action", "")
    sign_time = form.get("sign_time", "")
    sign_string = form.get("sign_string", "")
    error = form.get("error", "0")

    if not settings.click_secret_key:
        return {"error": -1, "error_note": "Click not configured"}

    expected = _click_sign(
        click_trans_id, service_id, settings.click_secret_key,
        merchant_trans_id, amount, action, sign_time,
    )
    if expected != sign_string:
        logger.warning("Click: invalid signature for trans %s", click_trans_id)
        return {"error": -1, "error_note": "Invalid signature"}

    try:
        payment_id = UUID(merchant_trans_id)
    except (ValueError, TypeError):
        return {"error": -5, "error_note": "Invalid merchant_trans_id"}

    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        return {"error": -5, "error_note": "Payment not found"}

    if action == "0":
        if payment.status == "completed":
            return {"error": -4, "error_note": "Already completed"}
        return {
            "click_trans_id": int(click_trans_id),
            "merchant_trans_id": merchant_trans_id,
            "merchant_prepare_id": str(payment.id),
            "error": 0,
            "error_note": "Success",
        }

    if action == "1":
        if str(error) != "0":
            payment.status = "failed"
            payment.provider_data = {**payment.provider_data, "click_error": error}
            db.add(payment)
            await db.commit()
            return {"error": -9, "error_note": f"Transaction cancelled by Click (error={error})"}

        payment.status = "completed"
        payment.provider_tx_id = str(click_trans_id)
        payment.provider_data = {**payment.provider_data, "click_trans_id": click_trans_id, "sign_time": sign_time}
        db.add(payment)

        order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
        order = order_result.scalar_one_or_none()
        if order and order.status != "completed":
            order.status = "completed"
            db.add(order)

        await db.commit()
        logger.info("Click: payment %s completed, click_trans_id=%s", payment.id, click_trans_id)

        # Не обходим фискализацию/аудит (раньше вебхуки их не вызывали вовсе)
        await record_fiscal_and_audit(db, payment, source="click")

        return {
            "click_trans_id": int(click_trans_id),
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": str(payment.id),
            "error": 0,
            "error_note": "Success",
        }

    return {"error": -3, "error_note": "Unknown action"}


# ═══════════════════════════════════════════════════════════════════════════════
#  Payme (JSON-RPC, Basic Auth)
# ═══════════════════════════════════════════════════════════════════════════════

PAYME_ERRORS = {
    "InvalidAuthorization": {"code": -32504, "message": {"ru": "Ошибка авторизации", "en": "Authorization error"}},
    "TransactionNotFound": {"code": -31003, "message": {"ru": "Транзакция не найдена", "en": "Transaction not found"}},
    "InvalidAmount": {"code": -31001, "message": {"ru": "Неверная сумма", "en": "Invalid amount"}},
    "OrderNotFound": {"code": -31050, "message": {"ru": "Заказ не найден", "en": "Order not found"}},
    "AlreadyDone": {"code": -31008, "message": {"ru": "Невозможно выполнить", "en": "Unable to perform"}},
    "MethodNotFound": {"code": -32601, "message": {"ru": "Метод не найден", "en": "Method not found"}},
}


def _payme_error(rpc_id, key):
    err = PAYME_ERRORS[key]
    return {"jsonrpc": "2.0", "id": rpc_id, "error": err}


def _payme_result(rpc_id, result):
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def _verify_payme_auth(auth_header: str) -> bool:
    if not settings.payme_merchant_id or not settings.payme_secret_key:
        return False
    if not auth_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth_header[6:]).decode()
        merchant_id, key = decoded.split(":", 1)
        return merchant_id == settings.payme_merchant_id and key == settings.payme_secret_key
    except Exception:
        return False


@router.post("/payme")
async def payme_webhook(
    request: Request,
    authorization: str = Header(""),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    if not _verify_payme_auth(authorization):
        return _payme_error(rpc_id, "InvalidAuthorization")

    if method == "CheckPerformTransaction":
        account = params.get("account", {})
        payment_id = account.get("payment_id")
        amount_tiyins = params.get("amount", 0)
        try:
            pid = UUID(payment_id)
        except (ValueError, TypeError):
            return _payme_error(rpc_id, "OrderNotFound")

        result = await db.execute(select(Payment).where(Payment.id == pid))
        payment = result.scalar_one_or_none()
        if not payment:
            return _payme_error(rpc_id, "OrderNotFound")

        expected_tiyins = int(payment.amount * 100)
        if amount_tiyins != expected_tiyins:
            return _payme_error(rpc_id, "InvalidAmount")

        return _payme_result(rpc_id, {"allow": True})

    if method == "CreateTransaction":
        account = params.get("account", {})
        payment_id = account.get("payment_id")
        payme_id = params.get("id", "")
        amount_tiyins = params.get("amount", 0)
        time_ms = params.get("time", 0)

        try:
            pid = UUID(payment_id)
        except (ValueError, TypeError):
            return _payme_error(rpc_id, "OrderNotFound")

        result = await db.execute(select(Payment).where(Payment.id == pid))
        payment = result.scalar_one_or_none()
        if not payment:
            return _payme_error(rpc_id, "OrderNotFound")

        if payment.status == "completed":
            return _payme_error(rpc_id, "AlreadyDone")

        payment.provider_tx_id = payme_id
        payment.provider_data = {
            **payment.provider_data,
            "payme_id": payme_id,
            "payme_time": time_ms,
            "payme_state": 1,
        }
        db.add(payment)
        await db.commit()

        create_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        return _payme_result(rpc_id, {
            "create_time": create_time,
            "transaction": str(payment.id),
            "state": 1,
        })

    if method == "PerformTransaction":
        payme_id = params.get("id", "")
        result = await db.execute(
            select(Payment).where(Payment.provider_tx_id == payme_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            return _payme_error(rpc_id, "TransactionNotFound")

        if payment.status == "completed":
            perform_time = payment.provider_data.get("perform_time", int(datetime.now(timezone.utc).timestamp() * 1000))
            return _payme_result(rpc_id, {
                "transaction": str(payment.id),
                "perform_time": perform_time,
                "state": 2,
            })

        payment.status = "completed"
        perform_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        payment.provider_data = {**payment.provider_data, "payme_state": 2, "perform_time": perform_time}
        db.add(payment)

        order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
        order = order_result.scalar_one_or_none()
        if order and order.status != "completed":
            order.status = "completed"
            db.add(order)

        await db.commit()
        logger.info("Payme: payment %s completed, payme_id=%s", payment.id, payme_id)

        # Не обходим фискализацию/аудит (раньше вебхуки их не вызывали вовсе)
        await record_fiscal_and_audit(db, payment, source="payme")

        return _payme_result(rpc_id, {
            "transaction": str(payment.id),
            "perform_time": perform_time,
            "state": 2,
        })

    if method == "CancelTransaction":
        payme_id = params.get("id", "")
        reason = params.get("reason", 0)

        result = await db.execute(
            select(Payment).where(Payment.provider_tx_id == payme_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            return _payme_error(rpc_id, "TransactionNotFound")

        payment.status = "refunded"
        cancel_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        payment.provider_data = {
            **payment.provider_data,
            "payme_state": -1 if payment.provider_data.get("payme_state") == 1 else -2,
            "cancel_time": cancel_time,
            "reason": reason,
        }
        db.add(payment)
        await db.commit()

        logger.info("Payme: payment %s cancelled, reason=%s", payment.id, reason)

        return _payme_result(rpc_id, {
            "transaction": str(payment.id),
            "cancel_time": cancel_time,
            "state": payment.provider_data["payme_state"],
        })

    if method == "CheckTransaction":
        payme_id = params.get("id", "")
        result = await db.execute(
            select(Payment).where(Payment.provider_tx_id == payme_id)
        )
        payment = result.scalar_one_or_none()
        if not payment:
            return _payme_error(rpc_id, "TransactionNotFound")

        state_map = {"pending": 1, "completed": 2, "failed": -1, "refunded": -2}
        state = payment.provider_data.get("payme_state", state_map.get(payment.status, 1))

        return _payme_result(rpc_id, {
            "create_time": payment.provider_data.get("payme_time", 0),
            "perform_time": payment.provider_data.get("perform_time", 0),
            "cancel_time": payment.provider_data.get("cancel_time", 0),
            "transaction": str(payment.id),
            "state": state,
            "reason": payment.provider_data.get("reason"),
        })

    return _payme_error(rpc_id, "MethodNotFound")


# ═══════════════════════════════════════════════════════════════════════════════
#  Uzum (POST webhook, подпись в заголовке)
# ═══════════════════════════════════════════════════════════════════════════════

def _verify_uzum_signature(body_bytes: bytes, signature: str) -> bool:
    if not settings.uzum_secret_key:
        return False
    expected = hashlib.sha256(body_bytes + settings.uzum_secret_key.encode()).hexdigest()
    return expected == signature


@router.post("/uzum")
async def uzum_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    body_bytes = await request.body()
    signature = request.headers.get("X-Signature", "")

    if not settings.uzum_secret_key:
        return {"status": "error", "message": "Uzum not configured"}

    if not _verify_uzum_signature(body_bytes, signature):
        logger.warning("Uzum: invalid signature")
        return Response(status_code=403, content="Invalid signature")

    import json
    try:
        data = json.loads(body_bytes)
    except json.JSONDecodeError:
        return Response(status_code=400, content="Invalid JSON")

    event = data.get("event", "")
    payment_id_str = data.get("merchant_trans_id") or data.get("payment_id", "")
    uzum_trans_id = data.get("trans_id", "")
    status_val = data.get("status", "")

    try:
        payment_id = UUID(payment_id_str)
    except (ValueError, TypeError):
        return {"status": "error", "message": "Invalid payment_id"}

    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        return {"status": "error", "message": "Payment not found"}

    if event == "payment.success" or status_val == "success":
        payment.status = "completed"
        payment.provider_tx_id = str(uzum_trans_id)
        payment.provider_data = {**payment.provider_data, "uzum_trans_id": uzum_trans_id, "uzum_event": event}
        db.add(payment)

        order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
        order = order_result.scalar_one_or_none()
        if order and order.status != "completed":
            order.status = "completed"
            db.add(order)

        await db.commit()
        logger.info("Uzum: payment %s completed, trans_id=%s", payment.id, uzum_trans_id)

        # Не обходим фискализацию/аудит (раньше вебхуки их не вызывали вовсе)
        await record_fiscal_and_audit(db, payment, source="uzum")

    elif event == "payment.cancelled" or status_val == "cancelled":
        payment.status = "failed"
        payment.provider_data = {**payment.provider_data, "uzum_event": event}
        db.add(payment)
        await db.commit()
        logger.info("Uzum: payment %s cancelled", payment.id)

    return {"status": "ok"}
