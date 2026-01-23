// import "dotenv/config";
// import { assertRoflReady } from "./rofl_guard.js";
// assertRoflReady();
// import express from "express";
// import { CFG } from "./config.js";
// import { routes } from "./routes.js";

// const app = express();
// app.use(express.json({ limit: "2mb" }));
// app.use(routes);

// app.listen(CFG.port, () => {
//   console.log(`PawPad API listening on :${CFG.port} (MOCK_ROFL=${CFG.mockRofl ? "1" : "0"})`);
// });

import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { CFG } from "./config.js";
import router from "./routes.js";
import { connectToDatabase } from "./database.js";
import { runTradingCycle } from "./trading.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(router);

// ✅ this prevents "Empty reply" and gives JSON error responses
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API error:", err?.stack || err);
  res.status(500).json({ error: "internal_error", message: String(err?.message || err) });
});

// Start DB and Scheduler
connectToDatabase().then(() => {
  // Schedule trading
  cron.schedule(CFG.tradingIntervalCron, () => {
    runTradingCycle().catch(err => console.error("Trading cycle error:", err));
  });
  console.log(`Trading scheduler started: ${CFG.tradingIntervalCron}`);
});

app.listen(CFG.port, () => {
  console.log(`PawPad API listening on :${CFG.port} (MOCK_ROFL=${CFG.mockRofl ? "1" : "0"})`);
});
