// Единая заглушка категории Финансы (Web Launch V1).
// Один центрированный текст «Скоро, эта категория дорабатывается»,
// больше ничего: ни таблиц, ни форм.
export default function FinanceStubPage({ title }) {
  return (
    <div className="settings-page">
      <section
        className="settings-card"
        style={{
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          minHeight: 320,
        }}
      >
        <div>
          <h1>{title}</h1>
          <p>Скоро, эта категория дорабатывается</p>
        </div>
      </section>
    </div>
  );
}
