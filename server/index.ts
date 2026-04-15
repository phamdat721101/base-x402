import "dotenv/config";
import express from "express";
import { network, isMainnet } from "./facilitator.js";
import { banner, warn, dim, green, cyan } from "../lib/terminal.js";
import exactRoutes from "./routes/exact.js";
import uptoRoutes from "./routes/upto.js";

const app = express();

app.use("/api/v1", exactRoutes);
app.use("/api/v2", uptoRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network });
});

app.listen(4021, () => {
  banner("x402 Bazaar Kit — Server", [
    `${dim("Network:")}  ${green(network)} ${isMainnet ? "(mainnet)" : "(testnet)"}`,
    `${dim("Bazaar:")}   ${green("enabled")} — endpoints discoverable after first payment`,
    "",
    `${cyan("GET")}  /api/v1/price    ${dim("exact $0.001")}`,
    `${cyan("GET")}  /api/v1/stats    ${dim("exact $0.005")}`,
    `${cyan("POST")} /api/v2/generate ${dim(`${isMainnet ? "upto" : "exact"} $0.10`)}`,
    `${cyan("GET")}  /health          ${dim("free")}`,
  ]);
  if (!isMainnet) {
    console.log(`  ${warn("upto scheme requires CDP facilitator (mainnet).")}`);
    console.log(`  ${dim("On testnet, /api/v2 uses exact as fallback.")}\n`);
  }
});
