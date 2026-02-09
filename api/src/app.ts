
import "dotenv/config";
import express from "express";
import router from "./routes.js";

export const app = express();

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(router);

// ✅ this prevents "Empty reply" and gives JSON error responses
app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("API error:", err?.stack || err);
    if (res.headersSent) {
        return _next(err);
    }
    res.status(500).json({ error: "internal_error", message: String(err?.message || err) });
});
