// Server-only configuration, captured once at boot. Restart ALL writers to change it.
const configured = process.env.BUYME_MAINTENANCE_MODE;
if (configured !== undefined && configured !== "true" && configured !== "false") {
  throw new Error("BUYME_MAINTENANCE_MODE must be exactly true or false (or unset).");
}

export const maintenanceMode = configured === "true";
export const maintenanceRetryAfterSeconds = 60;
export const maintenanceMessage =
  "BUYME is temporarily read-only for database recovery. Your device copy is preserved. Keep it and retry syncing after maintenance ends; do not clear local data.";

export class MaintenanceError extends Error {
  readonly code = "BUYME_MAINTENANCE";
  constructor() {
    super(maintenanceMessage);
  }
}

export function assertWritesAllowed(): void {
  if (maintenanceMode) throw new MaintenanceError();
}

export function applicationConnectionString(databaseUrl: string): string {
  if (!maintenanceMode) return databaseUrl;
  const url = new URL(databaseUrl);
  // URL options take precedence over Pool options in pg. Replace rather than
  // append them, so an existing read-write option cannot undo the freeze.
  url.searchParams.set("options", "-c default_transaction_read_only=on");
  return url.toString();
}
