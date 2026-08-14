import { formatDateLabel, todayInputValue, toDateInputValue } from "../../utils/date";

// Работа с периодом выручки OWNER-дашборда: разбор/нормализация диапазона дат
// и человекочитаемые подписи. Вынесено из OwnerDashboard.jsx (FE-07B) без изменений логики.

export function inputDateToReportDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateLabel(todayInputValue());
  }

  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function reportDateToInputDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return todayInputValue();
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function reportRangeEndingAt(days, endValue) {
  const end = new Date(`${endValue}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, days) + 1);

  return {
    preset: "",
    start: inputDateToReportDate(toDateInputValue(start)),
    end: inputDateToReportDate(toDateInputValue(end)),
    startTime: "00:00",
    endTime: "00:00",
  };
}

export function normalizeReportRange(range = {}) {
  const startInput = reportDateToInputDate(range.start);
  const endInput = reportDateToInputDate(range.end);
  const [dateFrom, dateTo] = startInput <= endInput ? [startInput, endInput] : [endInput, startInput];

  return {
    preset: range.preset || "",
    start: inputDateToReportDate(dateFrom),
    end: inputDateToReportDate(dateTo),
    startTime: "00:00",
    endTime: "00:00",
  };
}

export function reportRangeToApiParams(range) {
  const normalized = normalizeReportRange(range);
  return {
    date_from: reportDateToInputDate(normalized.start),
    date_to: reportDateToInputDate(normalized.end),
  };
}

export function reportRangeDays(range) {
  const normalized = normalizeReportRange(range);
  const start = new Date(`${reportDateToInputDate(normalized.start)}T00:00:00`);
  const end = new Date(`${reportDateToInputDate(normalized.end)}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function reportRangeLabel(range) {
  const normalized = normalizeReportRange(range);
  if (normalized.start === normalized.end) {
    return normalized.start;
  }

  return `${normalized.start} - ${normalized.end}`;
}

export function formatDaysLabel(days) {
  const value = Math.max(1, Number(days) || 1);
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} день`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} дня`;
  }

  return `${value} дней`;
}
