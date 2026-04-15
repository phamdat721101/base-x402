import { Router } from "express";
import express from "express";
import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitatorClient, network, isMainnet } from "../facilitator.js";

const router = Router();
const payTo = process.env.WALLET_ADDRESS!;

const scheme = isMainnet ? "upto" : "exact";
const server = new x402ResourceServer(facilitatorClient)
  .register(network, isMainnet ? new UptoEvmScheme() : new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

router.use(
  paymentMiddleware(
    {
      "POST /generate": {
        accepts: [{ scheme, price: "$0.10", network, payTo }],
        description: "AI text generation — billed per token (upto on mainnet, exact on testnet)",
        mimeType: "application/json",
        extensions: {
          ...declareDiscoveryExtension({
            bodyType: "json",
            input: { prompt: "Summarize the BTCFi ecosystem in 100 words" },
            inputSchema: {
              properties: {
                prompt: { type: "string", description: "Text prompt for generation" },
              },
              required: ["prompt"],
            },
            output: {
              example: { result: "Response text...", tokensUsed: 13, chargedAtomic: "130", scheme: "exact" },
              schema: {
                properties: {
                  result: { type: "string" },
                  tokensUsed: { type: "number" },
                  chargedAtomic: { type: "string" },
                  scheme: { type: "string" },
                },
                required: ["result", "tokensUsed", "chargedAtomic"],
              },
            },
          }),
        },
      },
    },
    server,
  ),
);

router.post("/generate", express.json(), (req, res) => {
  const prompt: string = req.body?.prompt ?? "hello world";
  const tokens = Math.ceil(prompt.split(" ").length * 1.3);
  const COST_PER_TOKEN_ATOMIC = 10;
  const actualCostAtomic = tokens * COST_PER_TOKEN_ATOMIC;

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
