#!/usr/bin/env python3
"""
Независимая проверка: победитель каскада не изменился.

Пишется НАМЕРЕННО отдельной реализацией (свой разбор, свой пропуск литералов),
а не поверх инструмента. Дважды за эту работу проверка, использовавшая ту же
логику, что и инструмент, повторяла его дефект и подтверждала сама себя:
один раз потерялись импорты внутри шаблонных строк, другой — скобки в
input[pattern="[0-9]{4}"] развалили весь CSS.

Что проверяется. Для каждой тройки (медиа-контекст, селектор, свойство)
вычисляется победитель по правилам каскада внутри одинаковой специфичности:
последнее объявление с !important, а если таких нет — просто последнее.
Победитель до и после правки обязан совпадать по значению и по важности.

    python3 tools/verify_css_winners.py before.json      # снять слепок
    python3 tools/verify_css_winners.py --compare before.json
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"

BUNDLES = {
    "kafe": [
        "styles/marjon-tokens.css", "styles/brand.css", "styles/dashboard.css",
        "styles/topbar-widgets.css", "styles/forms.css", "styles/tables.css",
        "styles/staff-pos.css", "styles/responsive.css", "styles/app.css",
        "styles/dashboard-curve.css", "styles/loader.css",
        "styles/react-overrides.css", "styles/modules/dashboard.css",
        "styles/receipt.css", "styles/auth.css", "styles/login-extras.css",
    ],
    "admin": ["admin/styles.css"],
}


def skip_literal(s, i):
    """Индекс за строкой или комментарием, начинающимися в i; иначе -1."""
    c = s[i]
    if c in '"\'':
        j = i + 1
        while j < len(s):
            if s[j] == "\\":
                j += 2
                continue
            if s[j] == c:
                return j + 1
            j += 1
        return len(s)
    if c == "/" and i + 1 < len(s) and s[i + 1] == "*":
        j = s.find("*/", i + 2)
        return len(s) if j == -1 else j + 2
    return -1


def find_top(s, ch, frm=0):
    i = frm
    while i < len(s):
        k = skip_literal(s, i)
        if k != -1:
            i = k
            continue
        if s[i] == ch:
            return i
        i += 1
    return -1


def match_brace(s, o):
    d, i = 0, o
    while i < len(s):
        k = skip_literal(s, i)
        if k != -1:
            i = k
            continue
        if s[i] == "{":
            d += 1
        elif s[i] == "}":
            d -= 1
            if d == 0:
                return i
        i += 1
    return -1


def split_top(s, sep):
    parts, buf, depth, i = [], "", 0, 0
    while i < len(s):
        k = skip_literal(s, i)
        if k != -1:
            buf += s[i:k]
            i = k
            continue
        c = s[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        elif c == sep and depth == 0:
            parts.append(buf)
            buf = ""
            i += 1
            continue
        buf += c
        i += 1
    parts.append(buf)
    return parts


def declarations(css, ctx=(), acc=None):
    """Список (медиа, селектор, свойство, значение, важность) по порядку."""
    if acc is None:
        acc = []
    i = 0
    while i < len(css):
        k = skip_literal(css, i)
        if k != -1 and css[i] == "/":
            i = k
            continue
        if css[i].isspace():
            i += 1
            continue
        b = find_top(css, "{", i)
        if b == -1:
            break
        semi = find_top(css, ";", i)
        if css[i] == "@" and semi != -1 and semi < b:
            i = semi + 1
            continue
        c = match_brace(css, b)
        if c == -1:
            break
        pre = " ".join(css[i:b].split())
        inner = css[b + 1:c]
        if pre.startswith("@"):
            if re.match(r"^@(media|supports|container|layer|document)\b", pre, re.I):
                declarations(inner, ctx + (pre,), acc)
            i = c + 1
            continue
        sels = [" ".join(x.split()) for x in split_top(pre, ",")]
        for seg in split_top(inner, ";"):
            colon = find_top(seg, ":")
            if colon <= 0:
                continue
            prop = seg[:colon].strip().lower()
            if not prop or prop.startswith("--"):
                continue
            val = seg[colon + 1:].strip()
            imp = bool(re.search(r"!\s*important\s*$", val, re.I))
            val = " ".join(re.sub(r"!\s*important\s*$", "", val, flags=re.I).split())
            for sel in sels:
                if sel:
                    acc.append((" && ".join(ctx), sel, prop, val, imp))
        i = c + 1
    return acc


def winners():
    """Победитель для каждой тройки (медиа, селектор, свойство)."""
    out = {}
    for name, files in BUNDLES.items():
        seq = []
        for rel in files:
            p = SRC / rel
            if p.exists():
                seq += declarations(p.read_text(encoding="utf-8"))
        best = {}
        for media, sel, prop, val, imp in seq:
            key = f"{name}|{media}|{sel}|{prop}"
            cur = best.get(key)
            # Важное побеждает обычное; среди равных по важности — последнее.
            if cur is None or imp or not cur[1]:
                if cur is None or imp >= cur[1]:
                    best[key] = (val, imp)
        out.update(best)
    return out


if __name__ == "__main__":
    if "--compare" in sys.argv:
        ref = json.loads(Path(sys.argv[sys.argv.index("--compare") + 1]).read_text())
        now = winners()
        changed = [k for k in set(ref) | set(now)
                   if list(ref.get(k, ["<нет>", False])) != list(now.get(k, ["<нет>", False]))]
        print(f"групп (медиа+селектор+свойство): было {len(ref)}, стало {len(now)}")
        print(f"ПОБЕДИТЕЛЬ ИЗМЕНИЛСЯ у: {len(changed)}")
        for k in changed[:15]:
            print(f"  {k}\n     было {ref.get(k)} -> стало {now.get(k)}")
        sys.exit(1 if changed else 0)

    out = Path(sys.argv[1])
    w = winners()
    out.write_text(json.dumps(w, ensure_ascii=False))
    print(f"слепок победителей: {len(w)} групп -> {out}")
