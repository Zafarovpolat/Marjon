import { useEffect, useState } from "react";
import { api } from "../../api/client";

export default function SettingsProfilePage() {
  const [form, setForm] = useState({ name: "", phone: "", address: "", inn: "", currency: "UZS" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api.get("/companies/me")
      .then(({ data }) => setForm({
        name: data.name || "",
        phone: data.phone || "",
        address: data.address || "",
        inn: data.inn || "",
        currency: data.currency || "UZS",
      }))
      .catch((err) => setError(err.response?.data?.detail || "Не удалось загрузить профиль."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true); setError(""); setSuccess("");
    try {
      await api.patch("/companies/me", form);
      setSuccess("Профиль сохранён.");
    } catch (err) {
      setError(err.response?.data?.detail || "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  if (loading) return <section className="card card-pad"><p>Загрузка...</p></section>;

  return (
    <section className="card card-pad">
      <div className="section-header">
        <div><span className="eyebrow">Настройки</span><h2>Профиль компании</h2></div>
      </div>
      {error ? <div className="login-error">{error}</div> : null}
      {success ? <div className="message message-success" style={{ marginBottom: 12 }}>{success}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
        {[
          { key: "name", label: "Название компании", placeholder: "MARJON" },
          { key: "phone", label: "Телефон", placeholder: "+998..." },
          { key: "address", label: "Адрес", placeholder: "г. Ташкент, ул. ..." },
          { key: "inn", label: "ИНН", placeholder: "123456789" },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>{label}</label>
            <input className="pos-search-input" value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        <div>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Валюта</label>
          <select className="pos-select" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            <option value="UZS">UZS — Узбекский сум</option>
            <option value="USD">USD — Доллар</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" type="button" disabled={saving} onClick={handleSave}>
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </section>
  );
}