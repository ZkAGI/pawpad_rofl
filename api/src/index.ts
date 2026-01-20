import "dotenv/config";
import express from "express";
import { CFG } from "./config.js";
import { routes } from "./routes.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(routes);

app.listen(CFG.port, () => {
  console.log(`PawPad API listening on :${CFG.port} (MOCK_ROFL=${CFG.mockRofl ? "1" : "0"})`);
});
