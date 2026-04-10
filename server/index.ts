import "dotenv/config";
import express from "express";
import { network, isMainnet } from "./facilitator.js";
import exactRoutes from "./routes/exact.js";
import uptoRoutes from "./routes/upto.js";

const app = express();

app.use("/api/v1", exactRoutes);
app.use("/api/v2", uptoRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network });
});

app.listen(4021, () => {
  console.log("x402 server running on http://localhost:4021");
  console.log(`Network: ${network} (${isMainnet ? "mainnet" : "testnet"})`);
  console.log("Endpoints:");
  console.log("  GET  /api/v1/price    (exact, $0.001)");
  console.log("  GET  /api/v1/stats    (exact, $0.005)");
  console.log(`  POST /api/v2/generate (${isMainnet ? "upto" : "exact fallback"}, max $0.10)`);
  if (!isMainnet) {
    console.log("\n⚠  upto scheme requires CDP facilitator (mainnet).");
    console.log("   On testnet, /api/v2 uses exact as fallback.");
    console.log("   Set NETWORK=mainnet + CDP keys to enable upto.\n");
  }
});
