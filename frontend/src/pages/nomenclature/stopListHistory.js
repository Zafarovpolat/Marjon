// Стоп-лист V3: видимая пара истории пополнений.
// Каноническая история живёт в backend (append-only product_limit_topups,
// порядок — seq). Здесь только display-правило:
//   visible = последние 2 подтверждённых пополнения (хронологически),
//   fallback — текущее абсолютное allowance мигрированных данных
//   (НЕ создаёт фиктивных строк истории, только отображение).
// Пусто + нет лимита → [] (ячейка покажет "—").

// Округление display-остатка до масштаба backend (NUMERIC 12,3),
// чтобы float-артефакты (0.30000000000000004) не попадали в текст.
export function roundScale3(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 1000) / 1000;
}

export function visibleTopups(recentTopups) {
  const amounts = (recentTopups || [])
    .map((t) => (t && t.amount != null ? Number(t.amount) : null))
    .filter((n) => Number.isFinite(n));
  return amounts.slice(-2);
}

// V3.7 display-модель ячейки истории:
// - pair: последние 2 пополнения (после checkpoint-фильтра backend);
// - fallback: топ-апов нет и сброса не было — текущее allowance
//   мигрированных данных как есть; allowance 0 сюда НЕ попадает
//   (ноль бывает только от explicit allowance-zero, а там всегда есть
//   checkpoint-контекст reset-состояния — показываем "—");
// - empty: нет ни того, ни другого, ВКЛЮЧАЯ пустое окно после сброса → "—".
// Сброс истории НЕ показывает "0": пустое окно означает отсутствие значения.
// Настоящий ноль остатка ("0 шт" при исчерпанной квоте) живёт в колонке
// Остаток и этой логикой не затрагивается.
export function historyView(recentTopups, { allowance = null, resetSeq = null } = {}) {
  const pair = visibleTopups(recentTopups);
  if (pair.length > 0) return { kind: "pair", pair };
  if (resetSeq == null) {
    const limit = allowance == null ? null : Number(allowance);
    if (limit != null && Number.isFinite(limit) && limit > 0) return { kind: "pair", pair: [limit] };
  }
  return { kind: "empty", pair: [] };
}
