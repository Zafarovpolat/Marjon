import { useState } from "react";

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

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("+998");
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
              <i className="bi bi-headset" />
            </span>
            <div>
              <strong>{text.title}</strong>
              <small>{text.subtitle}</small>
            </div>
            <button className="support-widget__close" type="button" aria-label={text.close} onClick={closeWidget}>
              <i className="bi bi-x-lg" />
            </button>
          </header>

          {sent ? (
            <div className="support-widget__success">
              <span aria-hidden="true"><i className="bi bi-check2-circle" /></span>
              <strong>{text.successTitle}</strong>
              <p>{text.successText}</p>
              <button type="button" onClick={() => {
                setMessage("");
                setSent(false);
              }}>
                {text.again}
              </button>
            </div>
          ) : (
            <form className="support-widget__form" onSubmit={handleSubmit}>
              <label className="support-widget__field">
                <span>{text.phone}</span>
                <div className="support-widget__phone">
                  <span className="support-widget__flag" aria-hidden="true">UZ</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="tel"
                    aria-label={text.phone}
                  />
                </div>
              </label>

              <label className="support-widget__field">
                <span>{text.message}</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={text.placeholder}
                  rows={4}
                />
              </label>

              <button className="support-widget__submit" type="submit" disabled={!message.trim()}>
                <i className="bi bi-send" aria-hidden="true" />
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
        onClick={() => setOpen((value) => !value)}
      >
        <i className={`bi ${open ? "bi-x-lg" : "bi-headset"}`} aria-hidden="true" />
      </button>
    </div>
  );
}
