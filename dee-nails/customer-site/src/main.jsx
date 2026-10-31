import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppointmentProvider } from "./lib/AppointmentContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppointmentProvider>
        <App />
      </AppointmentProvider>
    </BrowserRouter>
  </React.StrictMode>
);
