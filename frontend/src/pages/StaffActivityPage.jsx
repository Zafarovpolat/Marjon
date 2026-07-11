import { useEffect, useState } from "react";
import { api } from "../api/client";
import DemoNotice from "../components/DemoNotice";
import Icon from "../components/Icon";

const loginHistoryRows = [
  {
    date: "22.06.2026",
    employee: "SARDORKASSA",
    role: "Кассир",
    device: "192.168.1.24 / Windows POS",
    login: "09:02",
    logout: "18:12",
    status: "Успешно",
  },
  {
    date: "22.06.2026",
    employee: "Azizbek",
    role: "Официант",
    device: "192.168.1.38 / Android",
    login: "10:15",
    logout: "22:04",
    status: "Успешно",
  },
  {
    date: "21.06.2026",
    employee: "Povar Bekzod",
    role: "Повар",
    device: "192.168.1.45 / Kitchen tablet",
    login: "08:48",
    logout: "20:01",
    status: "Успешно",
  },
  {
    date: "21.06.2026",
    employee: "Rustam Manager",
    role: "Менеджер",
    device: "192.168.1.12 / MacBook",
    login: "09:30",
    logout: "19:10",
    status: "Успешно",
  },
];

const attendanceRows = [
  {
    date: "22.06.2026",
    employee: "SARDORKASSA",
    role: "Кассир",
    start: "09:00",
    end: "18:15",
    hours: "9 ч 15 мин",
    status: "Закрыта",
  },
  {
    date: "22.06.2026",
    employee: "Azizbek",
    role: "Официант",
    start: "10:00",
    end: "22:10",
    hours: "12 ч 10 мин",
    status: "Закрыта",
  },
  {
    date: "22.06.2026",
    employee: "Javohir Courier",
    role: "Курьер",
    start: "11:30",
    end: "21:00",
    hours: "9 ч 30 мин",
    status: "Закрыта",
  },
  {
    date: "21.06.2026",
    employee: "Omborchi",
    role: "Завсклад",
    start: "08:30",
    end: "17:40",
    hours: "9 ч 10 мин",
    status: "Закрыта",
  },
];

function StaffActivityPage({ type = "login-history" }) {
  const isAttendance = type === "attendance";
  const title = isAttendance ? "Посещаемость" : "История входа";
  const eyebrow = isAttendance ? "Смены сотрудников" : "Безопасность";
  const [loginRows, setLoginRows] = useState(loginHistoryRows);
  const [shiftRows, setShiftRows] = useState(attendanceRows);
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    const endpoint = isAttendance ? "/hr/attendance" : "/hr/login-history";
    api.get(endpoint)
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        if (items.length) {
          if (isAttendance) {
            setShiftRows(items.map((item) => ({
              date: item.date || "",
              employee: item.employee_name || item.employee || "",
              role: item.role || "",
              start: item.start_time || item.start || "",
              end: item.end_time || item.end || "",
              hours: item.hours || "",
              status: item.status || "Закрыта",
            })));
          } else {
            setLoginRows(items.map((item) => ({
              date: item.date || "",
              employee: item.employee_name || item.employee || "",
              role: item.role || "",
              device: item.device || `${item.ip || ""} / ${item.device_name || ""}`,
              login: item.login_time || item.login || "",
              logout: item.logout_time || item.logout || "",
              status: item.status || "Успешно",
            })));
          }
          setIsDemo(false);
        }
      })
      .catch(() => {});
  }, [isAttendance]);

  const displayLoginRows = loginRows;
  const displayAttendanceRows = shiftRows;

  return (
    <div className="staff-page">
      <section className="staff-card">
        {isDemo && (
          <DemoNotice />
        )}
        <header className="staff-header">
          <div className="staff-header__title">
            <span className="staff-header__accent" aria-hidden="true" />
            <div>
              <p className="staff-header__eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
            </div>
          </div>
          <button
            className="staff-add-button staff-add-button--ghost"
            type="button"
            onClick={() => window.alert("Excel-экспорт будет доступен в следующей версии")}
          >
            <Icon name="bi-file-earmark-spreadsheet" size={18} />
            Скачать Excel
          </button>
        </header>

        <div className="staff-table-wrapper">
          {isAttendance ? (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Начало смены</th>
                  <th>Конец смены</th>
                  <th>Отработано часов</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {displayAttendanceRows.map((row) => (
                  <tr key={`${row.date}-${row.employee}`}>
                    <td>{row.date}</td>
                    <td className="staff-name-cell">{row.employee}</td>
                    <td>
                      <span className="staff-role-badge">{row.role}</span>
                    </td>
                    <td>{row.start}</td>
                    <td>{row.end}</td>
                    <td>{row.hours}</td>
                    <td>
                      <span className="staff-status-badge">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>IP / устройство</th>
                  <th>Время входа</th>
                  <th>Время выхода</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {displayLoginRows.map((row) => (
                  <tr key={`${row.date}-${row.employee}-${row.login}`}>
                    <td>{row.date}</td>
                    <td className="staff-name-cell">{row.employee}</td>
                    <td>
                      <span className="staff-role-badge">{row.role}</span>
                    </td>
                    <td>{row.device}</td>
                    <td>{row.login}</td>
                    <td>{row.logout}</td>
                    <td>
                      <span className="staff-status-badge">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default StaffActivityPage;
