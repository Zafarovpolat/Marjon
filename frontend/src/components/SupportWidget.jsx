import { useState } from "react";
import Icon from "./Icon";

const text = {
  title: "\u0421\u0432\u044f\u0437\u044c \u0441 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u043e\u0439",
  subtitle: "\u041e\u0442\u0432\u0435\u0442\u0438\u043c \u043f\u043e \u043a\u0430\u0441\u0441\u0435, \u0441\u043a\u043b\u0430\u0434\u0443 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u0430\u043c",
  close: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c",
  open: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0443",
  phone: "\u0422\u0435\u043b\u0435\u0444\u043e\u043d",
  message: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435",
  placeholder: "\u041a\u043e\u0440\u043e\u0442\u043a\u043e \u043e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u043e\u043f\u0440\u043e\u0441...",
  send: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c",
  successTitle: "\u0417\u0430\u044f\u0432\u043a\u0430 \u043f\u0440\u0438\u043d\u044f\u0442\u0430",
  successText: "\u0421\u0432\u044f\u0436\u0435\u043c\u0441\u044f \u0441 \u0432\u0430\u043c\u0438 \u043f\u043e \u0443\u043a\u0430\u0437\u0430\u043d\u043d\u043e\u043c\u0443 \u043d\u043e\u043c\u0435\u0440\u0443.",
  again: "\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430",
};

const UZ_DIAL = "998";

const onlyDigits = (value = "") => String(value).replace(/\D/g, "");

const formatLocalPhone = (local = "") => {
  const value = onlyDigits(local).slice(0, 9);
  if (value.length <= 2) return value;
  if (value.length <= 5) return `${value.slice(0, 2)} ${value.slice(2)}`;
  if (value.length <= 7) return `${value.slice(0, 2)} ${value.slice(2, 5)}-${value.slice(5)}`;
  return `${value.slice(0, 2)} ${value.slice(2, 5)}-${value.slice(5, 7)}-${value.slice(7, 9)}`;
};

const getLocalFromFull = (value = "") => {
  const digits = onlyDigits(value);
  const local = digits.startsWith(UZ_DIAL) ? digits.slice(UZ_DIAL.length) : digits;
  return local.slice(0, 9);
};

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setSent(true);
  }

  function closeWidget() {
    setOpen(false);
    setSent(false);
  }

  return (
    <div className={`support-widget ${open ? "is-open" : ""}`}>
      {open ? (
        <section className="support-widget__panel" aria-label={text.title}>
          <header className="support-widget__header">
            <span className="support-widget__header-icon" aria-hidden="true">
              <Icon name="bi-headset" size={18} />
            </span>
            <div>
              <strong>{text.title}</strong>
              <small>{text.subtitle}</small>
            </div>
            <button className="support-widget__close" type="button" aria-label={text.close} onClick={closeWidget}>
              <Icon name="bi-x-lg" size={18} />
            </button>
          </header>

          {sent ? (
            <div className="support-widget__success">
              <span className="support-widget__success-icon" aria-hidden="true">
                <Icon name="bi-check2" size={32} />
              </span>
              <strong>{text.successTitle}</strong>
              <p>{text.successText}</p>
              <button type="button" onClick={() => { setMessage(""); setSent(false); }}>
                {text.again}
              </button>
            </div>
          ) : (
            <form className="support-widget__form" onSubmit={handleSubmit}>
              <label className="support-widget__field">
                <span>{text.phone}</span>
                <div className="support-widget__phone">
                  <span className="support-widget__dial-code">+{UZ_DIAL}</span>
                  <input
                    value={formatLocalPhone(getLocalFromFull(phone))}
                    onChange={(e) => setPhone(UZ_DIAL + onlyDigits(e.target.value))}
                    placeholder="XX XXX-XX-XX"
                    inputMode="tel"
                    aria-label={text.phone}
                  />
                </div>
              </label>

              <label className="support-widget__field">
                <span>{text.message}</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={text.placeholder}
                  rows={4}
                />
              </label>

              <button className="support-widget__submit" type="submit" disabled={!message.trim()}>
                <Icon name="bi-send" size={16} />
                <span>{text.send}</span>
              </button>
            </form>
          )}
        </section>
      ) : null}

      <button
        className="support-widget__toggle"
        type="button"
        aria-label={open ? text.close : text.open}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "bi-x-lg" : "bi-headset"} size={20} />
      </button>
    </div>
  );
}
