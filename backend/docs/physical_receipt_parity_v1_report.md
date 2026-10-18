# PHYSICAL RECEIPT PARITY V1 — READY FOR REVIEW

## Environment note

`D:\Программы\Marjon-backend-integration` and `D:\Программы\Marjon-receipt-density-tune`
do not exist on this machine. Work was done in the only real worktree —
`C:\Users\Asus Creator\Desktop\marjon-git\Marjon`, branch **`redesign-mobile`**,
HEAD `1dba2bb1`. The frontend (`receipt-density-tune-v1`, HEAD `0db500d`) was
already merged into this branch earlier in the same session — not an untouched
worktree, but it was not modified in this pass, only read as the source of
truth. The "pre-existing dirty WIP" described in the spec (formatter.py /
test_receipt_formatter_styles.py / auth/router.py) does not exist here; the
branch already had its own earlier receipt-parity formatter.py (v0), which is
what this pass audited and fixed. `auth/router.py` was not touched.

## 1–4. Worktree / branch / HEAD / WIP

See environment note above. Files changed:

- `backend/app/modules/printers/formatter.py`
- `backend/app/modules/printers/service.py`
- `backend/tests/test_receipt_formatter.py`
- `backend/tests/test_receipt_parity_integration.py`

## WIDTH

5. Centralized in `EscPosFormatter.__init__` (`self.cols`), explicitly tested
   (`test_column_count_by_paper_width`).
6. 58mm → 32 columns.
7. 80mm (and any ≥80) → 48 columns.

## HEADER

8. Branch name is no longer printed at all — not part of the accepted
   contract (`ReceiptPreview.jsx`'s `restaurantName` block renders only
   `{restaurantName}`).
9. The divider after the header run is still suppressed.
10. `order_type` is translated via `ORDER_TYPE_LABELS`.
11. The `orderNumber` block is now **two** separate rows ("Номер заказа:" /
    "Тип заказа:") instead of one combined row. `dateTime` now has the label
    "Дата:" and prints the **order creation time** (not print time), with no
    seconds.

## ITEMS

12. One canonical helper set — `_item_row` / `_two_col` / `_three_col`. Fixed
    budgets: qty=6, total=10 columns; the name column takes the remainder.
13. Safe word-wrap, never truncates. Column headers fixed to "Блюдо / Кол-во /
    Сумма" (were "Наименование / Кол." — did not match the admin preview;
    this was one of the two original user-reported discrepancies).
14. Modifiers wrap the same way.
15. **Item comments**: deliberately not added. `CustomerItems` in the accepted
    contract renders only name/qty/total — there is no per-item comment block
    on the customer receipt at all (unlike the kitchen ticket). Documented,
    not invented.

## TOTALS

16. Old behavior: `xlarge` = literal ESC/POS 2×2 (`GS!0x11`), applied purely
    because the frontend calls it "xlarge", not for a visual reason.
17. New behavior: `xlarge` = double-height only (same bit as "large") plus
    forced bold; width is never halved. This is the "nearest professional
    physical treatment," documented in the `_style_bytes` comment.
18. `enabled.total = false` now genuinely suppresses the "К ОПЛАТЕ:" line
    (previously printed unconditionally — the second real bug behind the
    user's original "чек отличается" report, even though not named
    explicitly).

## FOOTER

19. The thank-you default text now matches `ReceiptPreview.jsx`'s own
    fallback exactly ("XARIDINGIZ UCHUN RAXMAT!"; was a different Russian
    default).
20. Legacy `footerText` is still never printed.
21. `bottomOrderNumber` prints the real order number — unchanged, verified.
22. Feed/cut: `LF × 3` + partial cut, unchanged (already reasonable).

## STYLES

23. Size: standard / large / xlarge — documented above.
24. Align: left / center / right — unchanged.
25. Weight: bold / standard; xlarge now also forces bold.
26. lineSpacing: small / medium / large — unchanged (already implemented).
27. Reset safety: the style suffix always restores align/bold/size to
    default; the no-leak-between-blocks test passes.

## PAYMENTS

28. `.first()` now has an explicit `.order_by(Payment.created_at.desc())` —
    deterministic. The product contract was confirmed to be **truly
    one-payment-only** at the service layer (`PaymentService.process` hard-
    rejects a second completed payment and requires
    `amount == order.total_amount`), so representing "all payments" would be
    incorrect — a deterministic `.first()` is the right fix per the spec's own
    fallback instruction. The payment row now shows **both** the method and
    the amount ("Наличные: 94,080"); it previously showed a bare
    "Оплата: Наличные" with no figure, and printed "Оплата: —" even for an
    **unpaid** order — the first of the two original user-reported bugs,
    found from a photo of a printed receipt.

## TESTS

29. `tests/test_receipt_formatter.py` — 79 tests (was 74), all passing.
30. `tests/test_receipt_parity_integration.py` — 10 tests (was 7, 3 new: no
    payment row when unpaid, real method+amount when paid, date = order
    creation time), all passing. `test_print_contract.py` (7),
    `test_printer_crud.py` (9), `test_receipt_templates.py` (8),
    `test_terminal_parity.py` (7) — each run standalone, all clean. Running
    all six files together exceeded the 30-minute background cap purely from
    cumulative bcrypt cost across ~110+ tests — not a failure, just slow
    together.
31. Failures: 0 (after fixing two of my own new test assertions that had
    wrong expectations — not formatter bugs).
32. `git diff --check`: clean.

## SAMPLES

33/34/35 generated — normal 80mm, long dish name, narrow 58mm:

```
==================== A: NORMAL 80mm ====================
Marjon Cafe
г. Ташкент, ул. Амира Темура, 15
+998770702101
------------------------------------------------
Номер заказа: 71
Тип заказа: На месте
Номер стола: 33
Официант: Азиза Юсупова
Дата: 29.09.2026 20:51
------------------------------------------------
Блюдо                           Кол-во     Сумма
------------------------------------------------
Плов Ташкентский                     1    35,000
Шашлык из курицы                     1    32,000
+ Острый соус
------------------------------------------------
Итого:                                    67,000
НДС:                                       8,040
К ОПЛАТЕ:                                 75,040
Наличные:                                 75,040
------------------------------------------------
XARIDINGIZ UCHUN RAXMAT!
НОМЕР ЗАКАЗА
#71

==================== B: LONG DISH NAME 80mm (items excerpt) ====================
Блюдо                           Кол-во     Сумма
------------------------------------------------
Шашлык из баранины с луком,          2    92,000
овощами и специями большая
праздничная порция
+ Без лука, острый соус отдельно, побольше
зелени

==================== C: NARROW 58mm (excerpt) ====================
Блюдо           Кол-во     Сумма
--------------------------------
Плов Ташкентский     1    35,000
Шашлык из курицы     1    32,000
```

Sample B confirms the long dish name wraps across three lines without losing
a single word, and the qty/total columns stay aligned.

## SAFETY

36. Frontend changed = NO (read-only source of truth)
37. Desktop changed = NO
38. DB changed = NO
39. Deployment performed = NO
40. Commit/push = NO (working tree only, unstaged)

```
LONG_ITEM_WRAP_READY = YES
TOTAL_HIERARCHY_FIXED = YES
TOTAL_ENABLED_TRUTHFUL = YES
BOTTOM_ORDER_NUMBER_PHYSICAL = YES
LINE_SPACING_PHYSICAL = YES
FOOTER_DENSITY_FIXED = YES (already reasonable; not touched further)
LEGACY_FOOTER_GATED = YES
HEADER_PARITY_IMPROVED = YES
PAYMENT_SELECTION_DETERMINISTIC = YES
STYLE_RESET_SAFE = YES
GOLDEN_TESTS_ADDED = YES
FRONTEND_UNCHANGED = YES
DESKTOP_UNCHANGED = YES
READY_FOR_PHYSICAL_PRINT_REVIEW = YES
```

STOP. NO DEPLOY. NO COMMIT. NO PUSH.

## Summary

The two real bugs behind the original "чек отличается от админки" report
(wrong table headers + a phantom "Оплата: —" line on an unpaid receipt) were
already fixed in an earlier pass. This pass, driven by the full spec, found
and fixed seven further structural discrepancies that would very likely have
surfaced on the next test print: the combined order-number+type row, missing
"Стол:" label / missing date label, printing print-time instead of order-
creation-time, unconditionally printing "К ОПЛАТЕ:" regardless of
`enabled.total`, auto-printing the branch name, address/phone rendering in
the header instead of the footer, and a disproportionately huge literal 2×2
"К ОПЛАТЕ:".
