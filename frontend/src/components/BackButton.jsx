import { useNavigate } from "react-router-dom";
import Icon from "./Icon";

export default function BackButton() {
  const navigate = useNavigate();

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/", { replace: true });
    }
  }

  return (
    <button className="dashboard-back-button" type="button" onClick={handleBack} aria-label="Назад" title="Назад">
      <Icon name="bi-arrow-left" size={18} />
    </button>
  );
}
