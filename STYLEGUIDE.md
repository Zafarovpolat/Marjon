# Marjon — Style Guide & Design Tokens

## Палитра (источник истины: `marjon-tokens.css`)

### Бренд-голубой (Teal)
| Токен | HEX | Использование |
|-------|-----|---------------|
| `--teal-500` / `--color-brand` | `#1db5b5` | Акцент, кнопки CTA, иконки |
| `--teal-400` / `--color-brand-hover` | `#22d3ee` | Hover-состояние |
| `--teal-600` / `--color-brand-dark` | `#0fa3a3` | Активное/нажатое состояние |
| `--teal-50` | `#ecfeff` | Лёгкий фон-подложка |

### Navy / Нейтральный (тёмный → белый)
| Токен | HEX | Использование |
|-------|-----|---------------|
| `--neutral-950` | `#071428` | Самый тёмный фон, dark-режим |
| `--neutral-900` | `#0b1f3f` | **Тёмные панели, sidebar, боковые карточки** |
| `--neutral-800` | `#162840` | Вторичные тёмные поверхности |
| `--neutral-700` | `#243a56` | Тёмные бордеры |
| `--neutral-50` / `--color-bg` | `#f4f7fc` | Фон страницы |
| `--neutral-0` / `--color-card` | `#ffffff` | Фон карточек |

### Синий (интерактивный — только для интерактивных элементов)
| Токен | HEX | Использование |
|-------|-----|---------------|
| `--blue-600` / `--color-interactive` | `#2563eb` | Ссылки, вторичные кнопки |
| `--blue-700` | `#1d4ed8` | Hover ссылок |

> ⚠️ `--color-interactive` (`#2563eb`) — **не использовать как фон панелей/карточек**.  
> Только для текстовых ссылок и мелких UI-элементов.

---

## Правила применения цветов

### Тёмные панели / боковые секции
```css
/* ✅ Правильно */
background: var(--neutral-900);
background: linear-gradient(145deg, var(--neutral-800) 0%, var(--neutral-950) 100%);

/* ❌ Неправильно */
background: var(--color-interactive);   /* синий — не для панелей */
background: linear-gradient(..., var(--blue-600) ...);
background: linear-gradient(..., var(--color-brand) ...); /* teal — не для dark-панелей */
```

### Акцентные элементы (бейджи, иконки внутри тёмной панели)
```css
/* ✅ Teal-акцент на тёмном фоне */
background: rgba(29, 181, 181, 0.12);
border: 1px solid rgba(125, 232, 226, 0.18);
color: var(--teal-300);
```

### Основные кнопки
```css
/* ✅ Бренд-кнопка */
background: var(--color-brand);       /* #1db5b5 */
/* ✅ Hover */
background: var(--color-brand-hover); /* #22d3ee */
```

### Фон страницы и карточек
```css
body          { background: var(--color-bg);   } /* #f4f7fc */
.card         { background: var(--color-card); } /* #ffffff */
```

---

## Типографика

| Токен | Значение |
|-------|----------|
| `--font-display` | Manrope |
| `--font-body` | Golos Text, Manrope |
| `--font-mono` | JetBrains Mono |

**Размеры:** `--text-sm` 13px · `--text-base` 14px · `--text-md` 16px · `--text-xl` 20px · `--text-2xl` 24px

---

## Тени

```css
--shadow-xs  /* лёгкое разделение */
--shadow-sm  /* карточки */
--shadow-md  /* модалки, дропдауны */
--shadow-lg  /* большие оверлеи */
--shadow-glow /* teal-свечение для акцентных элементов */
```

Тень тёмных панелей: `0 10px 28px rgba(11, 31, 63, 0.35)`

---

## Радиусы

| Токен | px | Где |
|-------|----|-----|
| `--radius-sm` | 10px | Теги, бейджи |
| `--radius-md` | 14px | Поля ввода, кнопки |
| `--radius-lg` | 20px | Карточки |
| `--radius-xl` | 28px | Модалки, боковые панели |

---

## Компоненты — эталонные цвета

| Компонент | Фон | Текст |
|-----------|-----|-------|
| `balance-card-step__side` | `var(--neutral-900)` + gradient до `--neutral-950` | `#ffffff` |
| Основная кнопка | `var(--color-brand)` | `#ffffff` |
| Карточка дашборда | `var(--color-card)` | `var(--color-text-primary)` |
| Sidebar / навигация | `var(--neutral-900)` | `var(--neutral-200)` |
| Бейдж на тёмном | `rgba(29,181,181,0.12)` | `var(--teal-300)` |
| Статус success | `var(--color-success-bg)` | `var(--color-success)` |
| Статус danger | `var(--color-danger-bg)` | `var(--color-danger)` |

---

## Чего не делать

- ❌ Не использовать hex-коды напрямую — только токены из `marjon-tokens.css`
- ❌ Не использовать `--color-interactive` (`#2563eb`) как фон панелей
- ❌ Не использовать teal-градиенты на тёмных боковых секциях
- ❌ Не добавлять новые цвета без внесения в токены
