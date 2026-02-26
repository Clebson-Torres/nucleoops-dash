import React from "react";
import ReactDOM from "react-dom/client";
import { RootApp } from "./app/RootApp";
import "./styles/tokens.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
