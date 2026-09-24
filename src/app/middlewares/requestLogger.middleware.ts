import { randomUUID } from "crypto";
import { pinoHttp } from "pino-http";
import logger from "../../shared/logger";

// Logs one line per request, and gives every request an id. The id comes from
// X-Request-Id when a proxy already set one, and is sent back on the response
// so a client report can be matched with the server log.
const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = (req.headers["x-request-id"] as string) || randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (req, res) => {
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // Static files would flood the log.
  autoLogging: {
    ignore: (req) => req.url?.startsWith("/uploads") ?? false,
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export default requestLogger;
