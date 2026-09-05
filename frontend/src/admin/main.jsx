import React from "react";
import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp.jsx";
import "../i18n/index.js";
import "./shared/styles/data-table.css";
import "./features/organizations/organizations.css";
import "./styles.css";
import "./features/shell/shell.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
