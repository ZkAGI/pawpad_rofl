export const CFG = {
  port: Number(process.env.PORT || 8004),
  nodeEnv: (process.env.NODE_ENV || "development").trim(),

  // Production: Always false unless explicitly overridden for non-SGX testing
  mockRofl: (process.env.MOCK_ROFL || "0").trim() === "1",
  devMasterSecret: (process.env.DEV_MASTER_SECRET || "dev").trim(),

  roflSocket: (process.env.ROFL_APPD_SOCKET || "/run/rofl-appd.sock").trim(),
  roflAppIdBytes21: (process.env.ROFL_APP_ID_BYTES21 || "").trim(),

  // Trading & DB
  mongoUri: (process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pawpad_rofl").trim(),
  signalApiEth: "https://zynapse.zkagi.ai/v1/signal/ETH",
  signalApiSol: "https://zynapse.zkagi.ai/v1/signal/SOL",
  tradingIntervalCron: "0 */4 * * *", // Every 4 hours

  // ══════════════════════════════════════════════════════════════════════════
  // PRODUCTION SAFETY CONTROLS
  // ══════════════════════════════════════════════════════════════════════════

  // Emergency kill switch - set to "1" to immediately halt all trading
  // DEFAULT: TRUE (1) for safety. Must be explicitly set to "0" to enable.
  tradingDisabled: (process.env.TRADING_DISABLED || "1").trim() === "1",

  // Maximum slippage tolerance (basis points). 50 = 0.5%, 100 = 1%
  maxSlippageBps: Number(process.env.MAX_SLIPPAGE_BPS || 100),

  // Signal staleness limit in seconds. Signals older than this are rejected.
  signalMaxAgeSeconds: Number(process.env.SIGNAL_MAX_AGE_SECONDS || 600), // 10 minutes

  // Max price deviation from signal price to quote price (percent). Rejects bad quotes.
  maxPriceDeviationPercent: Number(process.env.MAX_PRICE_DEVIATION_PERCENT || 5),

  // Max deviation from CEX price (CoinGecko) percent. 
  // If DEX price differs from CEX by more than this, trade is aborted.
  cexPriceDeviationPercent: Number(process.env.CEX_PRICE_DEVIATION_PERCENT || 5),
  coingeckoApiKey: (process.env.COINGECKO_API_KEY || "").trim(),

  // Number of users to process concurrently during trading cycle
  tradingConcurrency: Number(process.env.TRADING_CONCURRENCY || 5),

  // ══════════════════════════════════════════════════════════════════════════

  sapphireRpc: (process.env.SAPPHIRE_RPC_URL || "https://testnet.sapphire.oasis.io").trim(),
  sapphireChainId: Number(process.env.SAPPHIRE_CHAIN_ID || 0x5aff),
  policyContract: (process.env.POLICY_CONTRACT || "").trim(),
  auditContract: (process.env.AUDIT_CONTRACT || "").trim(),

  recoveryTimelockSeconds: Number(process.env.RECOVERY_TIMELOCK_SECONDS || 86400),
  jwtTtlMinutes: Number(process.env.JWT_TTL_MINUTES || 60),

  enableChainCallsInMock: (process.env.ENABLE_CHAIN_CALLS_IN_MOCK || "0").trim() === "1"
};
