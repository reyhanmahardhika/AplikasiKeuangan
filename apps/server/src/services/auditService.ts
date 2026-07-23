import type { DbClient } from "../db/pool.js";

export async function writeAuditLog(
  db: DbClient,
  input: {
    userId?: string;
    action: string;
    entityName: string;
    entityId?: string;
    previousValue?: unknown;
    newValue?: unknown;
  }
) {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_name, entity_id, previous_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.userId ?? null,
      input.action,
      input.entityName,
      input.entityId ?? null,
      input.previousValue ? JSON.stringify(input.previousValue) : null,
      input.newValue ? JSON.stringify(input.newValue) : null
    ]
  );
}
