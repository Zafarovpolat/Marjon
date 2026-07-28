import React from "react";
import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp.jsx";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import "../i18n/index.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
