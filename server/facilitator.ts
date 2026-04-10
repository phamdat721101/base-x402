import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator as cdpFacilitator } from "@coinbase/x402";

export const isMainnet = process.env.NETWORK === "mainnet";

export const network = isMainnet ? "eip155:8453" : "eip155:84532";

export const facilitatorClient = new HTTPFacilitatorClient(
  isMainnet
    ? cdpFacilitator
    : { url: "https://x402.org/facilitator" },
);
