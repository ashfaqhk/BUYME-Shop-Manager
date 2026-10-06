import { pool, assertWritesAllowed } from "@workspace/db";

// Global caps, not keyed by IP: changing networks or restarting the server
// cannot create a fresh allowance. Every attempted provider call consumes one.
export const DAILY_SCAN_LIMIT = 8;
export const MONTHLY_SCAN_LIMIT = 40;

export async function reserveScan(): Promise<boolean> {
  assertWritesAllowed();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  // A single upsert makes reservation atomic across simultaneous requests and
  // multiple API instances. A missing table/database fails closed upstream.
  const result = await pool.query(
    `INSERT INTO scan_budget (id, day, month, daily_count, monthly_count)
     VALUES (1, $1, $2, 1, 1)
     ON CONFLICT (id) DO UPDATE SET
       day = EXCLUDED.day,
       month = EXCLUDED.month,
       daily_count = CASE WHEN scan_budget.day = EXCLUDED.day THEN scan_budget.daily_count + 1 ELSE 1 END,
       monthly_count = CASE WHEN scan_budget.month = EXCLUDED.month THEN scan_budget.monthly_count + 1 ELSE 1 END
     WHERE (scan_budget.day <> EXCLUDED.day OR scan_budget.daily_count < $3)
       AND (scan_budget.month <> EXCLUDED.month OR scan_budget.monthly_count < $4)
     RETURNING id`,
    [today, month, DAILY_SCAN_LIMIT, MONTHLY_SCAN_LIMIT],
  );
  return result.rowCount === 1;
}