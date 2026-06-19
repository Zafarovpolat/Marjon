import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ROLE_HOME } from "../utils/permissions";
import logo from "../assets/marjon-logo.svg";
import Icon from "../components/Icon";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginEmail, loginPhone } = useAuth();
  const [mode, setMode] = useState("email"); // 'email' | 'phone'
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = mode === "phone"
        ? await loginPhone(identity, password)
        : await loginEmail(identity, password);
      if (!remember) {
        localStorage.removeItem("refresh_token");
      }
      const role = user?.role_slugs?.[0] || (user?.is_superadmin ? "superadmin" : "owner");
      navigate(ROLE_HOME[role] || "/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось войти. Проверьте данные.");
    } finally {
      setLoading(false);
    }
  }

  const placeholder = mode === "phone" ? "+998 90 123 45 67" : "owner@marjon.uz";
  const inputType = mode === "phone" ? "tel" : "email";
  const inputIcon = mode === "phone" ? "bi-telephone" : "bi-person";
  const label = mode === "phone" ? "ТЕЛЕФОН" : "ЛОГИН / EMAIL";

  return (
    <main className="login-pro-shell">
      <section className="login-pro-brand">
        <div className="login-pro-brand__noise" />
        <div className="login-pro-brand__content">
          <img src={logo} alt="MARJON" className="login-pro-mark" decoding="async" />
          <h1>MARJON</h1>
          <p>Единая платформа для зала, кухни, доставки и аналитики ресторана.</p>
          <div className="login-pro-bullets">
            <span>Онлайн-меню и заказ по QR-коду</span>
            <span>Кухонный экран в реальном времени</span>
            <span>Отчеты и аналитика продаж</span>
            <span>Click, Payme, Uzum</span>
          </div>
        </div>
      </section>

      <section className="login-pro-panel">
        <form className="login-pro-card" onSubmit={handleSubmit}>
          <div className="login-pro-head">
            <div className="login-pro-logo-row">
              <img src={logo} alt="MARJON" decoding="async" />
              <div><strong>MARJON</strong><span>Restaurant OS</span></div>
            </div>
            <div className="login-pro-divider" />
            <h2>Добро пожаловать</h2>
            <p>Войдите в рабочее место вашего ресторана.</p>
          </div>

          <div className="login-pro-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "email"}
              className={`login-pro-tab ${mode === "email" ? "is-active" : ""}`}
              onClick={() => { setMode("email"); setIdentity(""); }}
            >
              Email
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "phone"}
              className={`login-pro-tab ${mode === "phone" ? "is-active" : ""}`}
              onClick={() => { setMode("phone"); setIdentity(""); }}
            >
              Телефон
            </button>
          </div>

          {error ? <div className="login-pro-alert">{error}</div> : null}

          <label className="login-pro-field">
            <span>{label}</span>
            <div className="login-pro-input-wrap">
              <Icon name={inputIcon} size={18} />
              <input
                type={inputType}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                required
                autoComplete={mode === "phone" ? "tel" : "email"}
                placeholder={placeholder}
                spellCheck="false"
              />
            </div>
          </label>

          <label className="login-pro-field">
            <span>ПАРОЛЬ</span>
            <div className="login-pro-input-wrap">
              <Icon name="bi-lock" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                spellCheck="false"
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
          </label>

          <div className="login-pro-row login-pro-row--single">
            <label className="login-pro-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Запомнить меня</span>
            </label>
          </div>

          <button className="login-pro-submit" type="submit" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </button>

          <div className="login-pro-alt">
            <Link to="/login/staff" className="login-pro-alt__link">
              <Icon name="bi-people" size={18} /> Вход сотрудников (PIN)
            </Link>
          </div>

          <p className="login-pro-foot">Нет аккаунта? <span>Свяжитесь с нами</span></p>
        </form>
      </section>
    </main>
  );
}
