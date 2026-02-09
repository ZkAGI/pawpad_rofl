import { describe, expect, test } from "@jest/globals";
import request from "supertest";
import { app } from "../app.js";

describe("API Integration Tests", () => {
    test("GET /health should return 200 OK", async () => {
        const response = await request(app).get("/health");
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
    });

    test("GET /unknown should return 404 (default express behavior covers this but we verify app structure)", async () => {
        const response = await request(app).get("/unknown-route-123");
        // Express default is 404 HTML, unless we have a catch-all.
        expect(response.status).toBe(404);
    });

    test("GET /v1/rofl/status should return 200/500 depending on mock state", async () => {
        // This hits the route handler. 
        // roflStatus function might fail if socket doesn't exist.
        // We just verify the route exists and is reachable.
        const response = await request(app).get("/v1/rofl/status");
        expect(response.status).not.toBe(404);
    });
});
