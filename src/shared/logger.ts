import os from "os";
import pino from "pino";
import config from "../config";

const isProduction = config.env === "production";

// Production writes one JSON line per log to stdout (PM2 collects it).
// Locally we pretty print instead. pino-pretty is a dev dependency, so it
// must never be used when NODE_ENV=production.
const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  // pid tells PM2 cluster workers apart
  base: { service: "yca-api", pid: process.pid, hostname: os.hostname() },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service" },
      },
});

export default logger;
