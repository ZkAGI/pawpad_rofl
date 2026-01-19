import express from "express";
import { CFG } from "./config.js";
import { routes } from "./routes.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(routes);

app.listen(CFG.port, () => {
  console.log(`PawPad ROFL API listening on :${CFG.port}`);
});

