import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { categorySchema, categoryUpdateSchema } from "../validators/schemas.js";
import { notFound } from "../utils/errors.js";
import { writeAuditLog } from "../services/auditService.js";

export const categoryRoutes = Router();
categoryRoutes.use(requireAuth);

categoryRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name, category_type AS "categoryType", icon, is_default AS "isDefault", is_active AS "isActive"
       FROM categories
       WHERE user_id = $1 AND is_active = true
       ORDER BY category_type, is_default DESC, name`,
      [req.user!.id]
    );
    res.json(result.rows);
  })
);

categoryRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = categorySchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO categories (user_id, name, category_type, icon)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, category_type AS "categoryType", icon, is_default AS "isDefault", is_active AS "isActive"`,
      [req.user!.id, payload.name, payload.categoryType, payload.icon]
    );
    await writeAuditLog(pool, { userId: req.user!.id, action: "CREATE", entityName: "Category", entityId: result.rows[0].id, newValue: result.rows[0] });
    res.status(201).json(result.rows[0]);
  })
);

categoryRoutes.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const payload = categoryUpdateSchema.parse(req.body);
    const current = await pool.query("SELECT * FROM categories WHERE id = $1 AND user_id = $2 AND is_active = true", [
      req.params.id,
      req.user!.id
    ]);
    if (!current.rowCount) throw notFound("Kategori tidak ditemukan");

    const row = current.rows[0];
    const result = await pool.query(
      `UPDATE categories
       SET name = $1, category_type = $2, icon = $3, updated_at = now()
       WHERE id = $4 AND user_id = $5
       RETURNING id, name, category_type AS "categoryType", icon, is_default AS "isDefault", is_active AS "isActive"`,
      [
        payload.name ?? row.name,
        payload.categoryType ?? row.category_type,
        payload.icon ?? row.icon,
        req.params.id,
        req.user!.id
      ]
    );
    await writeAuditLog(pool, {
      userId: req.user!.id,
      action: "UPDATE",
      entityName: "Category",
      entityId: result.rows[0].id,
      previousValue: row,
      newValue: result.rows[0]
    });
    res.json(result.rows[0]);
  })
);
