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

const phoneCountries = [
  { key: "UZ", label: "Узбекистан", dialCode: "998" },
  { key: "TR", label: "Турция", dialCode: "90" },
  { key: "RU", label: "Россия", dialCode: "7" },
  { key: "KZ", label: "Казахстан", dialCode: "7" },
  { key: "KG", label: "Киргизия", dialCode: "996" },
  { key: "TJ", label: "Таджикистан", dialCode: "992" },
  { key: "TM", label: "Туркменистан", dialCode: "993" },
  { key: "US", label: "Америка", dialCode: "1" },
];

const phoneCountryMap = phoneCountries.reduce((acc, country) => {
  acc[country.key] = country;
  return acc;
}, {});

const getPhoneFlag = (countryKey) =>
  `https://purecatamphetamine.github.io/country-flag-icons/3x2/${countryKey}.svg`;

const onlyDigits = (value = "") => String(value).replace(/\D/g, "");

const getPhoneLocal = (value = "", countryKey = "UZ") => {
  const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
  const digits = onlyDigits(value);
  const limit = getPhoneLocalLimit(country.key);
  let local = digits.startsWith(country.dialCode) ? digits.slice(country.dialCode.length) : digits;

  while (local.length > limit && local.startsWith(country.dialCode)) {
    local = local.slice(country.dialCode.length);
  }

  return local;
};

const getPhoneLocalLimit = (countryKey = "UZ") => (countryKey === "UZ" ? 9 : 10);

const formatLocalPhone = (local = "", countryKey = "UZ") => {
  const value = onlyDigits(local).slice(0, getPhoneLocalLimit(countryKey));

  if (countryKey === "UZ") {
    if (value.length <= 2) return value;
    if (value.length <= 5) return `${value.slice(0, 2)} ${value.slice(2)}`;
    if (value.length <= 7) return `${value.slice(0, 2)} ${value.slice(2, 5)}-${value.slice(5)}`;
    return `${value.slice(0, 2)} ${value.slice(2, 5)}-${value.slice(5, 7)}-${value.slice(7, 9)}`;
  }

  if (value.length <= 3) return value;
  if (value.length <= 6) return `${value.slice(0, 3)} ${value.slice(3)}`;
  if (value.length <= 8) return `${value.slice(0, 3)} ${value.slice(3, 6)}-${value.slice(6)}`;
  return `${value.slice(0, 3)} ${value.slice(3, 6)}-${value.slice(6, 8)}-${value.slice(8, 10)}`;
};

const formatSupportPhone = (value = "", countryKey = "UZ") => {
  const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
  const local = getPhoneLocal(value, country.key).slice(0, getPhoneLocalLimit(country.key));
  return local ? `+${country.dialCode} ${formatLocalPhone(local, country.key)}` : `+${country.dialCode}`;
};

const getPhonePlaceholder = (countryKey = "UZ") =>
  countryKey === "UZ" ? "XX XXX-XX-XX" : "XXX XXX-XX-XX";

const getSupportPhoneLocal = (value = "", countryKey = "UZ") =>
  getPhoneLocal(value, countryKey).slice(0, getPhoneLocalLimit(countryKey));

const normalizeSupportPhone = (value = "", countryKey = "UZ") => {
  const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
  const local = getPhoneLocal(value, country.key).slice(0, getPhoneLocalLimit(country.key));

  return local ? `+${country.dialCode}${local}` : `+${country.dialCode}`;
};

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState("UZ");
  const [phoneCountryOpen, setPhoneCountryOpen] = useState(false);
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
    setPhoneCountryOpen(false);
    setSent(false);
  }

  function selectPhoneCountry(countryKey) {
    const country = phoneCountryMap[countryKey] || phoneCountryMap.UZ;
    const local = getSupportPhoneLocal(phone, phoneCountry).slice(0, getPhoneLocalLimit(country.key));

    setPhoneCountry(country.key);
    setPhone(local ? `+${country.dialCode}${local}` : `+${country.dialCode}`);
    setPhoneCountryOpen(false);
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
              <span aria-hidden="true"><Icon name="bi-check2-circle" size={18} /></span>
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
                  <button
                    className="support-widget__country"
                    type="button"
                    onClick={() => setPhoneCountryOpen((value) => !value)}
                    aria-label="Выбрать страну"
                    aria-expanded={phoneCountryOpen}
                  >
                    <img
                      src={getPhoneFlag(phoneCountry)}
                      alt={phoneCountryMap[phoneCountry]?.label || ""}
                      loading="lazy"
                      decoding="async"
                    />
                    <Icon name="bi-chevron-down" size={12} />
                  </button>
                  {phoneCountryOpen && (
                    <div className="support-widget__country-menu">
                      {phoneCountries.map((country) => (
                        <button
                          className={phoneCountry === country.key ? "is-active" : ""}
                          type="button"
                          key={country.key}
                          onClick={() => selectPhoneCountry(country.key)}
                        >
                          <img src={getPhoneFlag(country.key)} alt="" loading="lazy" decoding="async" />
                          <span>{country.label}</span>
                          <b>+{country.dialCode}</b>
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="support-widget__dial-code">
                    +{phoneCountryMap[phoneCountry]?.dialCode || phoneCountryMap.UZ.dialCode}
                  </span>
                  <input
                    value={formatLocalPhone(getSupportPhoneLocal(phone, phoneCountry), phoneCountry)}
                    onChange={(event) => {
                      setPhone(normalizeSupportPhone(event.target.value, phoneCountry));
                    }}
                    placeholder={getPhonePlaceholder(phoneCountry)}
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
                <Icon name="bi-send" size={18} />
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
        <Icon name={open ? "bi-x-lg" : "bi-headset"} size={18} />
      </button>
    </div>
  );
}
