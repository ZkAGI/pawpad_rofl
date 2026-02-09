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
import { app } from "./app.js";
import cron from "node-cron";
import { CFG } from "./config.js";
import { connectToDatabase } from "./database.js";
import { runTradingCycle } from "./trading.js";

// Remove local express config, use imported app


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
