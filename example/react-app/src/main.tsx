import React from "react";
import ReactDOM from "react-dom/client";
import initBindings from "ankurah-org-example-wasm-bindings";
import App from "./App";
import "./index.css";

async function main() {
  await initBindings();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void main();
