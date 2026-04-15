import { Router } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitatorClient, network } from "../facilitator.js";

const router = Router();
const payTo = process.env.WALLET_ADDRESS!;

const server = new x402ResourceServer(facilitatorClient)
  .register(network, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

router.use(
  paymentMiddleware(
    {
      "GET /price": {
        accepts: [{ scheme: "exact", price: "$0.001", network, payTo }],
        description: "BTC/USDC price feed",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            output: {
              example: { btc: 95000, usdc: 1.0, timestamp: 1713168000000 },
              schema: {
                properties: {
                  btc: { type: "number", description: "BTC price in USD" },
                  usdc: { type: "number", description: "USDC price" },
                  timestamp: { type: "number", description: "Unix timestamp ms" },
                },
                required: ["btc", "usdc", "timestamp"],
              },
            },
          }),
        },
      },
      "GET /stats": {
        accepts: [{ scheme: "exact", price: "$0.005", network, payTo }],
        description: "BTCFi protocol stats",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            output: {
              example: { tvl: "2.3B", protocols: 42, apy: "8.5%" },
              schema: {
                properties: {
                  tvl: { type: "string", description: "Total value locked" },
                  protocols: { type: "number", description: "Number of protocols" },
                  apy: { type: "string", description: "Average APY" },
                },
                required: ["tvl", "protocols", "apy"],
              },
            },
          }),
        },
      },
    },
    server,
  ),
);

router.get("/price", (_req, res) => {
  res.json({ btc: 95000, usdc: 1.0, timestamp: Date.now() });
});

router.get("/stats", (_req, res) => {
  res.json({ tvl: "2.3B", protocols: 42, apy: "8.5%" });
});

export default router;
