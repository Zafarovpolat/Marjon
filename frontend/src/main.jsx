import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./i18n/index.js";
import "./styles/global/marjon-tokens.css";
import "./styles/global/brand.css";
import "./styles/owner/dashboard.css";
import "./styles/shared/topbar-widgets.css";
import "./styles/global/forms.css";
import "./styles/global/tables.css";
import "./styles/owner/staff-pos.css";
import "./styles/global/responsive.css";
import "./styles/app.css";
import "./styles/owner/dishes.css";
import "./styles/owner/report-datepicker.css";
import "./styles/owner/staff-users.css";
import "./styles/owner/nomenclature.css";
import "./styles/owner/warehouse.css";
import "./styles/owner/finance.css";
import "./styles/owner/settings.css";
import "./styles/shared/dashboard-curve.css";
import "./styles/global/loader.css";
import "./styles/react-overrides.css";
import "./styles/shared/receipt.css";
import "./styles/shared/auth.css";
import "./styles/shared/login-extras.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
