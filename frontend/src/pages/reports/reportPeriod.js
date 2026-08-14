// Общие помощники периода для страниц отчётов владельца.
// Единый источник диапазона по умолчанию и конверсии даты для API,
// чтобы страницы отчётов не дублировали одну и ту же логику периода.

// Диапазон "текущий месяц" в формате пикера (DD.MM.YYYY, без пресета).
export function currentMonthRange() {
  const now = new Date();
  return {
    preset: "",
    start: `01.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    end: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
  };
}

// Преобразует дату пикера DD.MM.YYYY в формат API YYYY-MM-DD.
export function toApiDate(value) {
  if (!value) return undefined;
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}
