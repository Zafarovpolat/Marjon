import { useMemo, useState } from "react";
import Icon from "./Icon";

const datePresets = [
  "Сегодня",
  "Вчера",
  "Эта неделя",
  "Этот месяц",
  "Прошлый месяц",
  "Этот квартал",
  "Прошлый квартал",
  "Этот год",
  "Прошлый год",
];

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const weekDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const timeSlots = Array.from({ length: 90 }, (_, index) => {
  const total = 16 * 60 + 28 + index;
  return `${padDate(Math.floor(total / 60) % 24)}:${padDate(total % 60)}`;
});

function padDate(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${padDate(date.getDate())}.${padDate(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function parseDate(value) {
  const [day, month, year] = value.split(".").map(Number);
  return new Date(year || 2026, (month || 1) - 1, day || 1);
}

function formatDateTime(range, key) {
  const time = range[`${key}Time`];
  return time ? `${range[key]} ${time}` : range[key];
}

function formatPeriodLabel(range) {
  return range.preset || `${formatDateTime(range, "start")} - ${formatDateTime(range, "end")}`;
}

function shiftRange(range, months) {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  start.setMonth(start.getMonth() + months);
  end.setMonth(end.getMonth() + months);
  return { preset: "", start: formatDate(start), end: formatDate(end), startTime: range.startTime, endTime: range.endTime };
}

function presetRange(label) {
  const today = new Date(2026, 5, 27);
  const start = new Date(today);
  const end = new Date(today);

  if (label === "Вчера") {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (label === "Эта неделя") {
    start.setDate(today.getDate() - 6);
  } else if (label === "Этот месяц") {
    start.setDate(1);
  } else if (label === "Прошлый месяц") {
    start.setMonth(today.getMonth() - 1, 1);
    end.setMonth(today.getMonth(), 0);
  } else if (label === "Этот квартал") {
    start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
  } else if (label === "Прошлый квартал") {
    const quarterStart = Math.floor(today.getMonth() / 3) * 3;
    start.setMonth(quarterStart - 3, 1);
    end.setMonth(quarterStart, 0);
  } else if (label === "Этот год") {
    start.setMonth(0, 1);
  } else if (label === "Прошлый год") {
    start.setFullYear(today.getFullYear() - 1, 0, 1);
    end.setFullYear(today.getFullYear() - 1, 11, 31);
  }

  return { preset: label, start: formatDate(start), end: formatDate(end) };
}

function calendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function MiniCalendar({ value, time, onSelectDate, onSelectTime }) {
  const parsed = parseDate(value);
  const [view, setView] = useState(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  const days = useMemo(() => calendarDays(view), [view]);
  const selected = formatDate(parsed);

  function updateYear(year) {
    setView(new Date(Number(year), view.getMonth(), 1));
  }

  function updateMonth(month) {
    setView(new Date(view.getFullYear(), Number(month), 1));
  }

  return (
    <div className="report-mini-calendar">
      <div className="report-mini-calendar__toolbar">
        <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="Предыдущий месяц">
          <Icon name="bi-chevron-left" size={14} />
        </button>
        <select value={view.getFullYear()} onChange={(event) => updateYear(event.target.value)} aria-label="Год">
          {[2024, 2025, 2026, 2027, 2028].map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select value={view.getMonth()} onChange={(event) => updateMonth(event.target.value)} aria-label="Месяц">
          {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
        </select>
        <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="Следующий месяц">
          <Icon name="bi-chevron-right" size={14} />
        </button>
      </div>
      <div className="report-mini-calendar__week">
        {weekDays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="report-mini-calendar__grid">
        {days.map((day) => {
          const formatted = formatDate(day);
          return (
            <button
              className={`${day.getMonth() === view.getMonth() ? "" : "is-muted"} ${formatted === selected ? "is-selected" : ""}`}
              type="button"
              key={formatted}
              onClick={() => onSelectDate(formatted)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <button className="report-mini-calendar__today" type="button" onClick={() => onSelectDate(formatDate(new Date(2026, 5, 27)))}>
        Today
      </button>
      <div className="report-mini-time">
        <strong>Выберите время</strong>
        <div className="report-mini-time__list">
          {timeSlots.map((slot) => (
            <button className={time === slot ? "is-selected" : ""} type="button" key={slot} onClick={() => onSelectTime(slot)}>
              {slot}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportDateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [calendarTarget, setCalendarTarget] = useState(null);

  function openPicker() {
    setDraft(value);
    setCalendarTarget(null);
    setOpen((current) => !current);
  }

  function applyDraft() {
    onChange(draft);
    setOpen(false);
    setCalendarTarget(null);
  }

  function shift(months) {
    const next = shiftRange(value, months);
    onChange(next);
    setDraft(next);
  }

  function selectDate(date) {
    setDraft((current) => ({ ...current, [calendarTarget]: date, preset: "" }));
  }

  function selectTime(time) {
    setDraft((current) => ({ ...current, [`${calendarTarget}Time`]: time, preset: "" }));
  }

  return (
    <div className="report-period-picker">
      <button className="report-period-nav" type="button" onClick={() => shift(-1)} aria-label="Предыдущий период">
        <Icon name="bi-chevron-left" size={16} />
      </button>
      <button className="report-period-button" type="button" onClick={openPicker} aria-expanded={open}>
        <span>{formatPeriodLabel(value)}</span>
      </button>
      <button className="report-period-nav" type="button" onClick={() => shift(1)} aria-label="Следующий период">
        <Icon name="bi-chevron-right" size={16} />
      </button>
      {open ? (
        <div className="report-date-menu">
          <div className="report-date-menu__title">
            <Icon name="bi-chevron-left" size={16} />
            <span>Выберите дату</span>
            <Icon name="bi-chevron-right" size={16} />
          </div>
          <div className="report-date-presets">
            {datePresets.map((preset) => (
              <button className={draft.preset === preset ? "is-active" : ""} type="button" key={preset} onClick={() => setDraft(presetRange(preset))}>
                {preset}
              </button>
            ))}
          </div>
          <div className="report-date-range">
            <button className={`report-date-input ${calendarTarget === "start" ? "is-active" : ""}`} type="button" onClick={() => setCalendarTarget(calendarTarget === "start" ? null : "start")}>
              {formatDateTime(draft, "start") || "01.01.2023"}
            </button>
            <span>-</span>
            <button className={`report-date-input ${calendarTarget === "end" ? "is-active" : ""}`} type="button" onClick={() => setCalendarTarget(calendarTarget === "end" ? null : "end")}>
              {formatDateTime(draft, "end") || "01.01.2023"}
            </button>
            <button className="report-date-ok" type="button" onClick={applyDraft}>OK</button>
            {calendarTarget ? (
              <MiniCalendar value={draft[calendarTarget]} time={draft[`${calendarTarget}Time`]} onSelectDate={selectDate} onSelectTime={selectTime} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
