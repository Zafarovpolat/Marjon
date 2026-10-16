import React from "react";
import ReactDOM from "react-dom/client";
import KitchenApp from "./KitchenApp.jsx";
import "../styles/global/marjon-tokens.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <KitchenApp />
  </React.StrictMode>,
);
