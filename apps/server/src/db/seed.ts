import bcrypt from "bcryptjs";
import { pool } from "./pool.js";
import { insertDefaultCategories } from "../services/categoryService.js";

async function seed() {
  const email = "demo@keuangan.ai";
  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await pool.query(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    ["Demo User", email, passwordHash]
  );

  const userId = user.rows[0].id;
  await insertDefaultCategories(pool, userId);
  await pool.query(
    `INSERT INTO accounts (user_id, name, account_type, initial_balance, current_balance)
     VALUES ($1, 'Tunai', 'cash', 1500000, 1500000)
     ON CONFLICT (user_id, name) DO NOTHING`,
    [userId]
  );
  console.log("Seed complete: demo@keuangan.ai / password123");
}

seed()
  .then(async () => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
