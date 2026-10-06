import type { RequestHandler, ErrorRequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import { GetMaintenanceStatusResponse } from "@workspace/api-zod";
import {
  maintenanceMode, maintenanceMessage, maintenanceRetryAfterSeconds,
  MaintenanceError, pool,
} from "@workspace/db";

// A boot identifier, not a host name, credential or database address.
const instanceId = randomUUID();

export function sendMaintenance(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", String(maintenanceRetryAfterSeconds));
  res.status(503).json({
    code: "BUYME_MAINTENANCE", error: maintenanceMessage,
    retryAfterSeconds: maintenanceRetryAfterSeconds,
  });
}

// Mount before body parsing and Clerk so writes have no database, storage,
// invitation or AI side effects. Clients cannot bypass this using a header/body.
export const maintenanceGate: RequestHandler = (req, res, next) => {
  if (maintenanceMode && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    sendMaintenance(res);
    return;
  }
  next();
};

// Public, read-only diagnostics. No toggle and no configuration/secret disclosure.
// This verifies a real connection, rather than merely echoing the environment.
export const maintenanceStatus: RequestHandler = async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const result = await pool.query("SHOW default_transaction_read_only");
    const databaseReadOnly = result.rows[0]?.default_transaction_read_only === "on";
    const verified = maintenanceMode && databaseReadOnly;
    res.status(maintenanceMode && !verified ? 503 : 200).json(GetMaintenanceStatusResponse.parse({
      instanceId, maintenance: maintenanceMode, databaseReadOnly, verified,
      retryAfterSeconds: maintenanceRetryAfterSeconds,
    }));
  } catch {
    // Never include database errors, addresses, connection options or credentials.
    res.status(503).json(GetMaintenanceStatusResponse.parse({
      instanceId, maintenance: maintenanceMode, databaseReadOnly: null, verified: false,
      error: "Cannot verify the database freeze. Do not begin recovery.",
    }));
  }
};

export const maintenanceErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof MaintenanceError ||
      (maintenanceMode && (error?.code === "25006" || error?.cause?.code === "25006"))) {
    sendMaintenance(res);
    return;
  }
  next(error);
};
