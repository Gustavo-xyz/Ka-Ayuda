import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import UserApp from "./UserApp";
import "./styles.css";  

const userPorts = new Set(["5174", "4174"]);
const searchParams = new URLSearchParams(window.location.search);
const isUserSide =
  userPorts.has(window.location.port) ||
  window.location.pathname.startsWith("/user") ||
  searchParams.get("side") === "user";

document.title = isUserSide ? "Ayuda User" : "Ayuda Admin";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isUserSide ? <UserApp /> : <App />}
  </React.StrictMode>,
);
