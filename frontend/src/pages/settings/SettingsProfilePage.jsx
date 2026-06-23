import { useState } from "react";

function SettingsProfilePage() {
  const [form, setForm] = useState({
    name: "SARDOR AVTO T",
    logo: "",
    phone: "+998 90 000 00 00",
    address: "Tashkent",
    inn: "123456789",
    defaultCurrency: "UZS",
    language: "Русский",
    timezone: "Asia/Tashkent",
    dayStart: "09:00",
    servicePercent: "10%",
    currency: "UZS",
    deposit: true,
  });

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="settings-page">
      <section className="settings-card">
        <header className="settings-header">
          <div className="settings-title-group">
            <span className="settings-accent-bar" />
            <div><p>Настройки</p><h1>Настройка профиля</h1></div>
          </div>
        </header>

        <div className="settings-profile-grid">
          <article>
            <h2>Информация ресторана</h2>
            <label><span>Название ресторана</span><input value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
            <label><span>Логотип</span><input value={form.logo} onChange={(event) => update("logo", event.target.value)} placeholder="URL логотипа" /></label>
            <label><span>Телефон</span><input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label>
            <label><span>Адрес</span><input value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
            <label><span>ИНН</span><input value={form.inn} onChange={(event) => update("inn", event.target.value)} /></label>
            <label><span>Валюта по умолчанию</span><select value={form.defaultCurrency} onChange={(event) => update("defaultCurrency", event.target.value)}><option>UZS</option><option>USD</option></select></label>
            <label><span>Язык интерфейса</span><select value={form.language} onChange={(event) => update("language", event.target.value)}><option>Русский</option><option>Uzbek</option></select></label>
          </article>

          <article>
            <h2>Рабочие настройки</h2>
            <label><span>Часовой пояс</span><input value={form.timezone} onChange={(event) => update("timezone", event.target.value)} /></label>
            <label><span>Начало рабочего дня</span><input value={form.dayStart} onChange={(event) => update("dayStart", event.target.value)} /></label>
            <label><span>Сервисный процент</span><input value={form.servicePercent} onChange={(event) => update("servicePercent", event.target.value)} /></label>
            <label><span>Валюта</span><select value={form.currency} onChange={(event) => update("currency", event.target.value)}><option>UZS</option><option>USD</option></select></label>
            <label className="settings-toggle-row"><span>Включить депозит</span><input type="checkbox" checked={form.deposit} onChange={(event) => update("deposit", event.target.checked)} /></label>
          </article>
        </div>

        <footer className="settings-form__footer settings-profile-footer">
          <button type="button">Отмена</button>
          <button type="button" onClick={() => console.log("profile settings", form)}>Сохранить настройки</button>
        </footer>
      </section>
    </div>
  );
}

export default SettingsProfilePage;
