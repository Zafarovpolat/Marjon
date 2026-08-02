#!/usr/bin/env python3
"""
Независимая проверка перевода каскада с !important на @layer.

ЗАЧЕМ ОТДЕЛЬНАЯ РЕАЛИЗАЦИЯ. В этом проекте проверка, написанная тем же
способом, что и правка, уже трижды подтверждала собственную ошибку: один раз
разделяемый регексп развалил CSS, и «проверяльщик» с тем же дефектом отчитался
об успехе. Поэтому здесь другой язык и свой разбор — общего кода с
layer-split.mjs нет намеренно.

ЧТО ИМЕННО ПРОВЕРЯЕТСЯ. Утверждение перевода: «объявления те же, просто граница
важности заменена границей слоёв». Значит, должно выполняться всё сразу:

  1. Множество объявлений совпадает. Для каждого (контекст at-правил, селектор,
     свойство, значение) в исходнике есть ровно столько же вхождений в
     результате — ни одно не потеряно и ни одно не задвоено.
  2. Важные ушли в overrides, обычные — в base. Ни одного исключения.
  3. Порядок ВНУТРИ каждого слоя исходный. Это ключевое: при равной
     специфичности спор решает порядок, и если он поедет — поедет вёрстка.
     Сравниваются последовательности по всем файлам сразу, а не пофайлово.
  4. Флагов не осталось (вне комментариев).
  5. Слои объявлены в правильном порядке: base раньше overrides. Иначе
     преобразование меняет смысл на противоположный.

Чего проверка НЕ ловит (для этого есть прогон в браузере): спор с inline-стилями
и с работающими анимациями — там !important и слой ведут себя по-разному.

    python3 tools/verify_layers.py           # сравнить с HEAD
    python3 tools/verify_layers.py --ref X   # сравнить с другой ревизией
"""
import re
import subprocess
import sys
from collections import Counter

SRC = "src"
FILES_ORDER = None  # заполняется из main.jsx: порядок подключения важен


# ── свой разбор ──────────────────────────────────────────────────────────────

def strip_comments(s):
    out, i = [], 0
    while i < len(s):
        if s[i] == "/" and i + 1 < len(s) and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            i = len(s) if j == -1 else j + 2
            continue
        if s[i] in "\"'":
            q, j = s[i], i + 1
            while j < len(s):
                if s[j] == "\\":
                    j += 2
                    continue
                if s[j] == q:
                    j += 1
                    break
                j += 1
            out.append(s[i:j])
            i = j
            continue
        out.append(s[i])
        i += 1
    return "".join(out)


def walk(css, ctx=(), layer=None, acc=None, ids=None):
    """Плоский список (контекст, слой, селектор, свойство, значение, важное, id).

    id — номер физического объявления. У правила `.a, .b { x: 1 }` строки
    получаются на каждый селектор, но текст объявления ОДИН, и флаг у него тоже
    один на всех. Без этого невозможно отличить «флаг оставлен осознанно» от
    «флаг заодно достался соседнему селектору по запятой».
    """
    if acc is None:
        acc = []
    if ids is None:
        ids = [0]
    i, buf, paren = 0, "", 0
    while i < len(css):
        c = css[i]
        if c in "\"'":
            q, j = c, i + 1
            while j < len(css):
                if css[j] == "\\":
                    j += 2
                    continue
                if css[j] == q:
                    j += 1
                    break
                j += 1
            buf += css[i:j]
            i = j
            continue
        if c == "(":
            paren += 1
        elif c == ")":
            paren = max(0, paren - 1)
        if c == "{" and not paren:
            depth, j = 0, i
            while j < len(css):
                if css[j] in "\"'":
                    q, k = css[j], j + 1
                    while k < len(css):
                        if css[k] == "\\":
                            k += 2
                            continue
                        if css[k] == q:
                            k += 1
                            break
                        k += 1
                    j = k
                    continue
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                    if not depth:
                        break
                j += 1
            head, body = " ".join(buf.split()), css[i + 1:j]
            buf, i = "", j + 1
            if head.startswith("@layer"):
                name = head[6:].strip().strip("{").strip() or "?"
                walk(body, ctx, name, acc, ids)
            elif head.startswith("@keyframes") or head.startswith("@font-face"):
                pass  # вне каскада селекторов
            elif head.startswith("@"):
                walk(body, ctx + (head,), layer, acc, ids)
            else:
                for d in split_decls(body):
                    d = d.strip()
                    if not d or ":" not in d:
                        continue
                    p, v = d.split(":", 1)
                    imp = bool(re.search(r"!\s*important\b", v, re.I))
                    v = re.sub(r"!\s*important", "", v, flags=re.I)
                    ids[0] += 1
                    for sel in split_sel(head):
                        acc.append((ctx, layer, sel, p.strip().lower(),
                                    " ".join(v.split()), imp, ids[0]))
            continue
        if c == ";" and not paren:
            buf = ""
            i += 1
            continue
        buf += c
        i += 1
    return acc


def split_decls(body):
    out, start, i, paren = [], 0, 0, 0
    while i < len(body):
        c = body[i]
        if c in "\"'":
            q, j = c, i + 1
            while j < len(body):
                if body[j] == "\\":
                    j += 2
                    continue
                if body[j] == q:
                    j += 1
                    break
                j += 1
            i = j
            continue
        if c == "(":
            paren += 1
        elif c == ")":
            paren = max(0, paren - 1)
        elif c == ";" and not paren:
            out.append(body[start:i])
            start = i + 1
        i += 1
    out.append(body[start:])
    return out


def split_sel(head):
    out, start, i, paren, brack = [], 0, 0, 0, 0
    while i < len(head):
        c = head[i]
        if c in "\"'":
            q, j = c, i + 1
            while j < len(head):
                if head[j] == "\\":
                    j += 2
                    continue
                if head[j] == q:
                    j += 1
                    break
                j += 1
            i = j
            continue
        if c == "(":
            paren += 1
        elif c == ")":
            paren -= 1
        elif c == "[":
            brack += 1
        elif c == "]":
            brack -= 1
        elif c == "," and not paren and not brack:
            out.append(" ".join(head[start:i].split()))
            start = i + 1
        i += 1
    out.append(" ".join(head[start:].split()))
    return [s for s in out if s]


# ── сбор ─────────────────────────────────────────────────────────────────────

_PSEUDO_EL = re.compile(r"::[-\w]+")
_ZERO = re.compile(r":(?:where|is|not|has|matches|any)\s*\(")


def specificity(sel):
    """Тройка (id, класс/атрибут/псевдокласс, элемент/псевдоэлемент).

    Точность здесь вторична: селекторы преобразованием не меняются, поэтому
    любая систематическая ошибка одинакова с обеих сторон и на сравнение не
    влияет. Важно лишь, чтобы функция была детерминированной.
    """
    s = re.sub(r"\[[^\]]*\]", "[]", sel)          # содержимое атрибутов не считаем
    a = len(re.findall(r"#[-\w]+", s))
    el = len(_PSEUDO_EL.findall(s))
    s2 = _PSEUDO_EL.sub(" ", s)
    b = len(re.findall(r"\.[-\w]+", s2)) + s2.count("[]") + \
        len([m for m in re.findall(r":[-\w]+", s2) if not _ZERO.match(m + "(")])
    c = el + len(re.findall(r"(?:^|[\s>+~(])([a-zA-Z][-\w]*)", s2))
    return (a, b, c)


def css_files():
    """Порядок подключения из main.jsx — от него зависит разрешение споров."""
    order = []
    for entry in ("src/main.jsx", "src/admin/main.jsx"):
        try:
            txt = open(entry, encoding="utf8").read()
        except OSError:
            continue
        base = "src/admin/" if "admin" in entry else "src/"
        for m in re.finditer(r'import\s+"\./([^"]+\.css)"', txt):
            order.append(base + m.group(1))
    return order


def load(ref=None):
    """Разбирает все CSS либо из рабочего дерева, либо из ревизии git."""
    acc = []
    for f in css_files():
        if ref:
            r = subprocess.run(["git", "show", f"{ref}:frontend/{f}"],
                               capture_output=True, text=True)
            if r.returncode:
                continue
            src = r.stdout
        else:
            try:
                src = open(f, encoding="utf8").read()
            except OSError:
                continue
        for row in walk(strip_comments(src)):
            acc.append((f,) + row)
    return acc


def main():
    ref = None
    if "--ref" in sys.argv:
        ref = sys.argv[sys.argv.index("--ref") + 1]
    before = load(ref or "HEAD")
    after = load(None)
    print(f"объявлений: было {len(before)}, стало {len(after)}")

    ok = True

    # 1. Множества совпадают (без учёта слоя и важности)
    key = lambda r: (r[0], r[1], r[3], r[4], r[5])          # файл, ctx, селектор, свойство, значение
    cb, ca = Counter(map(key, before)), Counter(map(key, after))
    lost, extra = cb - ca, ca - cb
    print(f"1. потеряно {sum(lost.values())}, лишних {sum(extra.values())}")
    if lost or extra:
        ok = False
        for k, n in list((lost + extra).items())[:8]:
            print(f"      {n}x {k[0]} | {k[2][:50]} | {k[3]}: {k[4][:30]}")

    # 2. Главная проверка: ПОРЯДОК КАСКАДА ЦЕЛИКОМ.
    #
    # Спор за элемент решается по убыванию: важность (после правки — слой),
    # затем специфичность, затем порядок в исходнике. Если выстроить ВСЕ
    # объявления по этому ключу и обе последовательности совпадут, значит для
    # любого элемента и любого набора подошедших селекторов победит то же
    # объявление. Это сильнее сравнения по одному селектору: споры идут как раз
    # МЕЖДУ разными селекторами.
    #
    # Селекторы текстом не менялись, поэтому неточности в подсчёте
    # специфичности одинаковы с обеих сторон и взаимно сокращаются.
    def rank_before(i_r):
        i, r = i_r
        return (1 if r[6] else 0, specificity(r[3]), i)

    def rank_after(i_r):
        i, r = i_r
        return (1 if r[2] == "overrides" else 0, specificity(r[3]), i)

    ob = [key(r) for _, r in sorted(enumerate(before), key=rank_before)]
    oa = [key(r) for _, r in sorted(enumerate(after), key=rank_after)]
    same = ob == oa
    print(f"2. порядок каскада целиком: {'совпадает' if same else 'РАСХОДИТСЯ'} ({len(ob)} объявлений)")
    if not same:
        ok = False
        for i, (x, y) in enumerate(zip(ob, oa)):
            if x != y:
                print(f"      первое расхождение на позиции {i}:")
                print(f"        было : {x[2][:60]} | {x[3]}: {x[4][:30]}")
                print(f"        стало: {y[2][:60]} | {y[3]}: {y[4][:30]}")
                break

    # 3. Порядок внутри слоёв — сквозной по всем файлам
    seq_b_norm = [key(r) for r in before if not r[6]]
    seq_b_imp = [key(r) for r in before if r[6]]
    seq_a_base = [key(r) for r in after if r[2] == "base"]
    seq_a_over = [key(r) for r in after if r[2] == "overrides"]
    for label, b, a in (("base", seq_b_norm, seq_a_base), ("overrides", seq_b_imp, seq_a_over)):
        same = b == a
        print(f"3. порядок в слое {label}: {'совпадает' if same else 'РАСХОДИТСЯ'} ({len(b)} -> {len(a)})")
        if not same:
            ok = False
            for i, (x, y) in enumerate(zip(b, a)):
                if x != y:
                    print(f"      первое расхождение на позиции {i}:")
                    print(f"        было : {x[2][:60]} | {x[3]}: {x[4][:30]}")
                    print(f"        стало: {y[2][:60]} | {y[3]}: {y[4][:30]}")
                    break

    # 4. Флаги остались ТОЛЬКО у документированного исключения.
    #
    # Единственное, чего слои не умеют, — перебивать inline-стиль. Там, где
    # разметка задаёт значение прямо в элементе, а таблица стилей обязана его
    # перекрыть, флаг должен сохраниться. Требовать здесь строгий ноль значило
    # бы подгонять красивую цифру ценой поведения: набор исключений сверяется с
    # тем, что было важным в исходнике, — не больше и не меньше.
    # Исключение задано по УПОМИНАНИЮ имени в селекторе, а не по последнему
    # куску. Причина не в удобстве, а в замкнутости: соперник за то же свойство
    # обязан подходить к тому же элементу, значит упоминает тот же класс. Если
    # вернуть флаг только части спорящих правил, победитель сменится — так и
    # случилось с высотой графика на дашборде владельца (292px против 318px).
    EXC = [
        (re.compile(r"sidebar-user|sidebar-account"),
         re.compile(r"^background(-color|-image)?$")),
        (re.compile(r"canvas|chart-wrap"),
         re.compile(r"^(width|height|min-width|min-height|max-width|max-height|display|box-sizing)$")),
    ]

    def allowed(sel, prop):
        return any(t.search(sel) and p.match(prop) for t, p in EXC)

    left = [r for r in after if r[6]]
    ident = lambda r: (r[0], r[1], r[3], r[4], r[5])

    # Множество должно совпасть ТОЧНО с тем, что было важным в исходнике и
    # подпадает под исключение. Не подмножество и не надмножество: лишний флаг
    # ломает чужой спор, потерянный — проигрывает inline-стилю.
    want = {ident(r) for r in before if r[6] and allowed(r[3], r[4])}
    got = {ident(r) for r in left}
    # Флаг стоит на ОБЪЯВЛЕНИИ, а у него бывает несколько селекторов через
    # запятую: если исключение нужно хотя бы одному, флаг достаётся всем. В
    # исходнике объявление тоже было важным для всех своих селекторов, так что
    # это не расширение, а сохранение.
    ok_decl = {r[7] for r in left if allowed(r[3], r[4])}
    got_core = {ident(r) for r in left if allowed(r[3], r[4])}
    shared = {ident(r) for r in left if r[7] in ok_decl and not allowed(r[3], r[4])}
    print(f"4. важных объявлений осталось: {len(left)} строк на {len(set(r[7] for r in left))} объявлениях"
          f" ({len(shared)} досталось соседям по запятой)")
    if got_core != want:
        ok = False
        print(f"      набор не совпал: нужно {len(want)}, получилось {len(got_core)}")
        for x in list(want - got_core)[:4]:
            print(f"        потеряно: {x[2][:58]} | {x[3]}")
        for x in list(got_core - want)[:4]:
            print(f"        лишнее  : {x[2][:58]} | {x[3]}")
    stray = [r for r in left if r[7] not in ok_decl]
    if stray:
        ok = False
        print(f"      флаг без оправдания: {len(stray)}")
        for r in stray[:4]:
            print(f"        {r[3][:58]} | {r[4]}")
    extra_new = got - {ident(r) for r in before if r[6]}
    if extra_new:
        ok = False
        print(f"      флагов, которых не было в исходнике: {len(extra_new)}")

    # 5. Порядок объявления слоёв
    bad_order = []
    for f in css_files():
        try:
            src = strip_comments(open(f, encoding="utf8").read())
        except OSError:
            continue
        m = re.search(r"@layer\s+([^;{]+);", src)
        names = [n.strip() for n in m.group(1).split(",")] if m else []
        if names[:2] != ["base", "overrides"]:
            bad_order.append(f"{f}: {names or 'нет объявления слоёв'}")
    print(f"5. файлов с неверным порядком слоёв: {len(bad_order)}")
    for b in bad_order[:5]:
        print("      " + b)
    if bad_order:
        ok = False

    # 6. Расположение @import и @charset.
    #
    # Добавлено по факту: первая версия преобразования задвоила @import — одна
    # копия в шапке, вторая внутри @layer base, где правило недопустимо и
    # молча отбрасывается. Проверки 1-5 этого не увидели, потому что @import
    # не объявление и в их подсчёты не попадает. Заодно ловится нарушение
    # порядка: @import обязан идти раньше любого правила.
    misplaced = []
    for f in css_files():
        try:
            src = strip_comments(open(f, encoding="utf8").read())
        except OSError:
            continue
        for m in re.finditer(r"@(import|charset)\b[^;]*;", src):
            head = src[:m.start()]
            if head.count("{") != head.count("}"):
                misplaced.append(f"{f}: @{m.group(1)} внутри блока")
            elif re.search(r"[^@\s;{}][^;{}]*\{", head):
                misplaced.append(f"{f}: @{m.group(1)} после первого правила")
    print(f"6. @import/@charset не на месте: {len(misplaced)}")
    for x in misplaced[:5]:
        print("      " + x)
    if misplaced:
        ok = False

    # 7. Окружение @keyframes сохранено.
    #
    # Добавлено по факту, как и проверка 6. Набор кадров может лежать ВНУТРИ
    # @media — тогда анимация существует только на своей ширине экрана. Первая
    # версия преобразования выносила такие блоки на верхний уровень, и анимация
    # начинала существовать всегда. Проверки 1-5 слепы к этому: @keyframes не
    # объявление и в каскаде селекторов не участвует.
    def keyframe_contexts(text):
        out, stack, i, depth = {}, [], 0, 0
        while i < len(text):
            if text[i] == "@":
                m = re.match(r"@(?:-\w+-)?keyframes\s+([-\w]+)", text[i:])
                if m:
                    out.setdefault(m.group(1), []).append(tuple(stack))
            if text[i] == "{":
                k = max(text.rfind("}", 0, i), text.rfind("{", 0, i)) + 1
                stack.append(" ".join(text[k:i].split())[:80])
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if stack:
                    stack.pop()
            i += 1
        return out

    kf_bad = []
    for f in css_files():
        try:
            now = strip_comments(open(f, encoding="utf8").read())
        except OSError:
            continue
        r = subprocess.run(["git", "show", f"{(ref or 'HEAD')}:frontend/{f}"],
                           capture_output=True, text=True)
        if r.returncode:
            continue
        was = keyframe_contexts(strip_comments(r.stdout))
        got = keyframe_contexts(now)
        for name, ctxs in was.items():
            # Слои — наша собственная обёртка, их из сравнения убираем.
            clean = [tuple(c for c in ctx if not c.startswith("@layer")) for ctx in ctxs]
            mine = [tuple(c for c in ctx if not c.startswith("@layer"))
                    for ctx in got.get(name, [])]
            if sorted(clean) != sorted(mine):
                kf_bad.append(f"{f}: @keyframes {name}: было {clean}, стало {mine}")
    print(f"7. @keyframes с изменившимся окружением: {len(kf_bad)}")
    for x in kf_bad[:5]:
        print("      " + x)
    if kf_bad:
        ok = False

    print("\nИТОГ: " + ("преобразование эквивалентно" if ok else "ЕСТЬ РАСХОЖДЕНИЯ"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
