import { describe, expect, test } from "@jest/globals";
import { validateAndParseAmount } from "../withdraw.js";
// We don't need to mock imports for this helper as it relies on ethers which is a library, 
// and we want to verify ethers behavior too.
// However, withdraw.js imports other things. If those imports fail/run side effects, we might need to mock them.
// But mostly they are safe imports (types, libraries).

describe("Withdraw Validation Logic", () => {
    describe("validateAndParseAmount", () => {
        test("should parse simple integer amounts", () => {
            // USDC 6 decimals
            const result = validateAndParseAmount("100", 6);
            expect(result.valid).toBe(true);
            expect(result.value).toBe(100000000n); // 100 * 1e6
        });

        test("should parse decimal amounts", () => {
            // ETH 18 decimals
            const result = validateAndParseAmount("0.5", 18);
            expect(result.valid).toBe(true);
            expect(result.value).toBe(500000000000000000n); // 0.5 * 1e18
        });

        test("should reject negative amounts", () => {
            const result = validateAndParseAmount("-5", 6);
            expect(result.valid).toBe(false);
            expect(result.error).toContain("positive");
        });

        test("should reject zero", () => {
            const result = validateAndParseAmount("0", 6);
            expect(result.valid).toBe(false);
            expect(result.error).toContain("positive");
        });

        test("should reject invalid strings", () => {
            const result = validateAndParseAmount("abc", 6);
            expect(result.valid).toBe(false);
            expect(result.error).toContain("Invalid amount");
        });

        test("should handle very small decimals (solana 9 decimals)", () => {
            // 0.000000001
            const result = validateAndParseAmount("0.000000001", 9);
            expect(result.valid).toBe(true);
            expect(result.value).toBe(1n);
        });

        test("should handle too many decimals", () => {
            // 6 decimals allowed, passing 7
            const result = validateAndParseAmount("0.1234567", 6);
            // ethers.parseUnits throws on too many decimals
            expect(result.valid).toBe(false);
            expect(result.error).toContain("Invalid amount");
        });
    });
});
