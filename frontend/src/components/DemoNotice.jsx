import Icon from "./Icon";

export default function DemoNotice({ text = "Демо-данные — бэкенд пока не подключён, отображаются примеры" }) {
  return (
    <div className="settings-demo-notice">
      <Icon name="bi-info-circle" size={16} />
      {text}
    </div>
  );
}
