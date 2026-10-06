import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { maintenanceGate, maintenanceStatus, maintenanceErrors } from "./middlewares/maintenance";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.get("/api/maintenance", maintenanceStatus);
app.use("/api", maintenanceGate);
// This one route accepts a single, short-lived document encoded as a data URL.
app.use("/api/billing/extract-list", express.json({ limit: "9mb" }));
app.use("/api/catalog/scan-product", express.json({ limit: "9mb" }));
app.use("/api/shop/images", express.json({ limit: "9mb" }));
app.use("/api/shop", express.json({ limit: "64mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env.CLERK_PUBLISHABLE_KEY),
})));

app.use("/api", router);
app.use(maintenanceErrors);

export default app;
