import express from "express";
import router from "../../src/routes";
import { maintenanceGate, maintenanceStatus, maintenanceErrors } from "../../src/middlewares/maintenance";
export { reserveScan } from "../../src/lib/scan-budget";
export { metrics } from "./maintenance-db";

export const app = express();
app.get("/api/maintenance", maintenanceStatus);
app.use("/api", maintenanceGate);
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).log = { info() {}, warn() {}, error() {} };
  next();
});
app.use("/api", router);
app.use(maintenanceErrors);
