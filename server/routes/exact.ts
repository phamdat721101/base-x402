import { Router } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { facilitatorClient, network } from "../facilitator.js";

const router = Router();
const payTo = process.env.WALLET_ADDRESS!;

const server = new x402ResourceServer(facilitatorClient)
  .register(network, new ExactEvmScheme());

router.use(
  paymentMiddleware(
    {
      "GET /price": {
        accepts: [{ scheme: "exact", price: "$0.001", network, payTo }],
        description: "BTC/USDC price feed",
        mimeType: "application/json",
      },
      "GET /stats": {
        accepts: [{ scheme: "exact", price: "$0.005", network, payTo }],
        description: "BTCFi protocol stats",
        mimeType: "application/json",
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
