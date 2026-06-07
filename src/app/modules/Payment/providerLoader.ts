// src/payment/ProviderLoader.ts
import fs from "fs";
import path from "path";
import { paymentConfig } from "./payment.config";

export async function loadProviders() {
    const providersPath = paymentConfig.providersPath
  const providersDir = path.join(__dirname, providersPath);

  const files = fs.readdirSync(providersDir).filter(f => f.endsWith(".js") || f.endsWith(".ts"));



  for (const file of files) {
    const modulePath = path.join(providersDir, file);
    console.log(`Loading payment provider from ${modulePath}`);
    await import(`file:${modulePath}`); // just importing triggers self-registration
  }
}
