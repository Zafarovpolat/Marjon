import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ROLE_HOME } from "../utils/permissions";
import logo from "../assets/marjon-logo.svg";
import Icon from "../components/Icon";

const PREFIX = "+998 ";

function applyPhoneMask(raw) {
  // +998 XX XXX-XX-XX
  const digits = raw.replace(/\D/g, "");
  const body = digits.startsWith("998") ? digits.slice(3) : digits;
  const local = body.slice(0, 9);
  let out = PREFIX;
  if (local.length === 0) return out;
  if (local.length <= 2) return out + local;
  out += local.slice(0, 2) + " ";
  if (local.length <= 5) return out + local.slice(2);
  out += local.slice(2, 5) + "-";
  if (local.length <= 7) return out + local.slice(5);
  out += local.slice(5, 7) + "-" + local.slice(7);
  return out;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginPhone } = useAuth();
  const [phone, setPhone] = useState(PREFIX);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handlePhoneChange(e) {
    const raw = e.target.value;
    // Не даем удалить префикс.
    if (!raw.startsWith("+")) return;
    setPhone(applyPhoneMask(raw));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await loginPhone(phone, password);
      if (!remember) localStorage.removeItem("refresh_token");
      const role = user?.role_slugs?.[0] || (user?.is_superadmin ? "superadmin" : "owner");
      navigate(ROLE_HOME[role] || "/", { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : "Неверный номер или пароль."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-pro-shell">
      <section className="login-pro-brand">
        <div className="login-pro-brand__noise" />
        <div className="login-pro-brand__content">
          <img src={logo} alt="MARJON" className="login-pro-mark" decoding="async" />
          <h1>MARJON</h1>
          <p>Единая платформа для зала, кухни, доставки и аналитики ресторана.</p>
          <div className="login-pro-bullets">
            <span><i className="login-pro-bullet-icon"><Icon name="bi-check2" size={17} strokeWidth={3} /></i>Онлайн-меню и заказ по QR-коду</span>
            <span><i className="login-pro-bullet-icon"><Icon name="bi-check2" size={17} strokeWidth={3} /></i>Кухонный экран в реальном времени</span>
            <span><i className="login-pro-bullet-icon"><Icon name="bi-check2" size={17} strokeWidth={3} /></i>Отчеты и аналитика продаж</span>
            <span><i className="login-pro-bullet-icon"><Icon name="bi-check2" size={17} strokeWidth={3} /></i>Click, Payme, Uzum</span>
          </div>
        </div>
      </section>

      <section className="login-pro-panel">
        <form className="login-pro-card" onSubmit={handleSubmit}>
          <div className="login-pro-head">
            <h2>Добро пожаловать</h2>
            <p>Войдите в рабочее место вашего ресторана.</p>
          </div>

          {error ? <div className="login-pro-alert">{error}</div> : null}

          <label className="login-pro-field">
            <span>НОМЕР ТЕЛЕФОНА</span>
            <div className="login-pro-input-wrap">
              <Icon name="bi-telephone" size={18} strokeWidth={2.5} />
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                required
                autoComplete="tel"
                spellCheck="false"
                inputMode="numeric"
              />
            </div>
          </label>

          <label className="login-pro-field">
            <span>ПАРОЛЬ</span>
            <div className="login-pro-input-wrap">
              <Icon name="bi-lock" size={18} strokeWidth={2.5} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Введите пароль"
                spellCheck="false"
              />
              <button type="button" className="login-pro-eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                <Icon name={showPassword ? "bi-eye-slash" : "bi-eye"} size={18} />
              </button>
            </div>
          </label>

          <div className="login-pro-row">
            <label className="login-pro-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Запомнить меня</span>
            </label>
            <a href="#" className="login-pro-forgot">Забыли пароль?</a>
          </div>

          <button className="login-pro-submit" type="submit" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
