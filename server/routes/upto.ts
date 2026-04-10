import { Router } from "express";
import express from "express";
import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { facilitatorClient, network, isMainnet } from "../facilitator.js";

const router = Router();
const payTo = process.env.WALLET_ADDRESS!;

// upto requires CDP facilitator (mainnet only).
// On testnet, fall back to exact scheme so builders can still test the endpoint.
const scheme = isMainnet ? "upto" : "exact";
const server = new x402ResourceServer(facilitatorClient)
  .register(network, isMainnet ? new UptoEvmScheme() : new ExactEvmScheme());

router.use(
  paymentMiddleware(
    {
      "POST /generate": {
        accepts: [{ scheme, price: "$0.10", network, payTo }],
        description: "AI text generation — billed per token (upto on mainnet, exact on testnet)",
        mimeType: "application/json",
      },
    },
    server,
  ),
);

router.post("/generate", express.json(), (req, res) => {
  const prompt: string = req.body?.prompt ?? "hello world";
  const tokens = Math.ceil(prompt.split(" ").length * 1.3);
  const COST_PER_TOKEN_ATOMIC = 10; // 0.00001 USDC (6 decimals)
  const actualCostAtomic = tokens * COST_PER_TOKEN_ATOMIC;

  // On mainnet (upto), settle only what was used. On testnet (exact), this is ignored.
  if (isMainnet) {
    setSettlementOverrides(res, { amount: String(actualCostAtomic) });
  }

  res.json({
    result: `Response to: ${prompt}`,
    tokensUsed: tokens,
    chargedAtomic: String(actualCostAtomic),
    scheme,
  });
});

export default router;
