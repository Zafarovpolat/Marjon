import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./i18n/index.js";
import "./styles/marjon-tokens.css";
import "./styles/brand.css";
import "./styles/dashboard.css";
import "./styles/topbar-widgets.css";
import "./styles/forms.css";
import "./styles/tables.css";
import "./styles/staff-pos.css";
import "./styles/responsive.css";
import "./styles/app.css";
import "./styles/dashboard-curve.css";
import "./styles/loader.css";
import "./styles/react-overrides.css";
// Модуль дашборда вынесен из react-overrides.css; подключается сразу после
// него, чтобы порядок в каскаде остался прежним.
import "./styles/modules/dashboard.css";
import "./styles/receipt.css";
import "./styles/auth.css";
import "./styles/login-extras.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
