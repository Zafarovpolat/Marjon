"""Cent-exact allocation of an order's frozen amounts to its item authors."""
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP


def allocate_amount(total, weights):
    weights = [max(Decimal("0"), Decimal(w)) for w in weights]
    if not sum(weights):
        return [Decimal("0")] * len(weights)
    cents = int(Decimal(total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) * 100)
    exact = [abs(cents) * w / sum(weights) for w in weights]
    whole = [int(v.to_integral_value(rounding=ROUND_FLOOR)) for v in exact]
    for index in sorted(range(len(weights)), key=lambda i: (-(exact[i] - whole[i]), i))[:abs(cents) - sum(whole)]:
        whole[index] += 1
    return [Decimal(v) / 100 * (-1 if cents < 0 else 1) for v in whole]
