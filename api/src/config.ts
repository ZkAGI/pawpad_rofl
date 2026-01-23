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
  signalApiEth: "https://pawpad-arcium-backend.onrender.com/api/signals/ETH",
  signalApiSol: "https://pawpad-arcium-backend.onrender.com/api/signals/SOL",
  tradingIntervalCron: "0 */4 * * *", // Every 4 hours

  sapphireRpc: (process.env.SAPPHIRE_RPC_URL || "https://testnet.sapphire.oasis.io").trim(),
  sapphireChainId: Number(process.env.SAPPHIRE_CHAIN_ID || 0x5aff),
  policyContract: (process.env.POLICY_CONTRACT || "").trim(),
  auditContract: (process.env.AUDIT_CONTRACT || "").trim(),

  recoveryTimelockSeconds: Number(process.env.RECOVERY_TIMELOCK_SECONDS || 86400),
  jwtTtlMinutes: Number(process.env.JWT_TTL_MINUTES || 60),

  enableChainCallsInMock: (process.env.ENABLE_CHAIN_CALLS_IN_MOCK || "0").trim() === "1"
};
