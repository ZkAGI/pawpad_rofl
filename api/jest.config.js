export default {
    preset: "ts-jest/presets/default-esm", // Use ESM preset
    testEnvironment: "node",
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { useESM: true }]
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    },
    extensionsToTreatAsEsm: [".ts"],
    testMatch: ["**/src/tests/**/*.test.ts"],
    verbose: true
};
