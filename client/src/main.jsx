import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SignPage from "./pages/SignPage.jsx";
import AnalyzePage from "./pages/AnalyzePage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import "./App.css";

const routes = {
  "/sign": SignPage,
  "/analyze": AnalyzePage,
  "/dashboard": DashboardPage,
};

const Page = routes[window.location.pathname] || App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
