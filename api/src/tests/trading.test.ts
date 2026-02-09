import { describe, expect, test, jest } from "@jest/globals";
import { normalizeAction, applySlippage, isSignalFresh } from "../trading.js"; // Note: .js extension for ESM

describe("Trading Logic Unit Tests", () => {

    describe("normalizeAction", () => {
        test("should normalize valid actions", () => {
            expect(normalizeAction("buy")).toBe("BUY");
            expect(normalizeAction("Buy")).toBe("BUY");
            expect(normalizeAction("SELL")).toBe("SELL");
            expect(normalizeAction("hold")).toBe("HOLD");
        });

        test("should return HOLD for invalid actions", () => {
            expect(normalizeAction("foobar")).toBe("HOLD");
            expect(normalizeAction(null)).toBe("HOLD");
            expect(normalizeAction(undefined)).toBe("HOLD");
            expect(normalizeAction(123)).toBe("HOLD");
        });
    });

    describe("applySlippage", () => {
        test("should calculate min amount correctly for 1% slippage", () => {
            // 1% slippage = 100 bps
            const amount = 1000000n;
            const expected = 990000n; // 1M * 0.99
            expect(applySlippage(amount, 100)).toBe(expected);
        });

        test("should calculate min amount correctly for 0.5% slippage", () => {
            // 0.5% slippage = 50 bps
            const amount = 1000000n;
            const expected = 995000n; // 1M * 0.995
            expect(applySlippage(amount, 50)).toBe(expected);
        });

        test("should handle 0 slippage", () => {
            const amount = 1000n;
            expect(applySlippage(amount, 0)).toBe(1000n);
        });
    });

    describe("isSignalFresh", () => {
        // Mock the CFG object if needed or assume default. 
        // Since CFG is imported in trading.js, we might need to mock the module or rely on dev value.
        // trading.ts imports CFG. Let's assume default SIGNAL_MAX_AGE_SECONDS is 600 (10 mins).
        // To be safe, we should mock the whole config module, but for basic logic check:

        test("should accept fresh signals", () => {
            const now = Date.now();
            const signal = { timestamp: new Date(now - 1000).toISOString() }; // 1 sec old
            // We can't easily change CFG from here without mocking, 
            // but assuming it's > 1s, this should pass.
            expect(isSignalFresh(signal)).toBe(true);
        });

        test("should reject very old signals", () => {
            const now = Date.now();
            // 1 hour old
            const signal = { timestamp: new Date(now - 3600 * 1000).toISOString() };
            expect(isSignalFresh(signal)).toBe(false);
        });

        test("should reject missing timestamp", () => {
            expect(isSignalFresh({})).toBe(false);
        });
    });
});
