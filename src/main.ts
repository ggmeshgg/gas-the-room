import { SimulatorApp } from "./app/SimulatorApp";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

const app = new SimulatorApp(root);
void app.start();
