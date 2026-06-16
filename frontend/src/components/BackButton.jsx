import { useNavigate } from "react-router-dom";

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
    <button className="dashboard-back-button" type="button" onClick={handleBack}>
      <i className="bi bi-arrow-left" aria-hidden="true" />
      <span>Назад</span>
    </button>
  );
}
