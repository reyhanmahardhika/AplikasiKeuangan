import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { createApp } from "./app.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});

process.on("SIGINT", async () => {
  server.close();
  await pool.end();
  process.exit(0);
});
