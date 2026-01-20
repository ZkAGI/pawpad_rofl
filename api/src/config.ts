export const CFG = {
  port: Number(process.env.PORT || 8004),
  nodeEnv: (process.env.NODE_ENV || "development").trim(),

  mockRofl: (process.env.MOCK_ROFL || "0").trim() === "1",
  devMasterSecret: (process.env.DEV_MASTER_SECRET || "dev").trim(),

  roflSocket: (process.env.ROFL_APPD_SOCKET || "/run/rofl-appd.sock").trim(),
  roflAppIdBytes21: (process.env.ROFL_APP_ID_BYTES21 || "").trim(),

  sapphireRpc: (process.env.SAPPHIRE_RPC_URL || "").trim(),
  sapphireChainId: Number(process.env.SAPPHIRE_CHAIN_ID || 0),
  policyContract: (process.env.POLICY_CONTRACT || "").trim(),
  auditContract: (process.env.AUDIT_CONTRACT || "").trim(),

  recoveryTimelockSeconds: Number(process.env.RECOVERY_TIMELOCK_SECONDS || 86400),
  jwtTtlMinutes: Number(process.env.JWT_TTL_MINUTES || 30),

  enableChainCallsInMock: (process.env.ENABLE_CHAIN_CALLS_IN_MOCK || "0").trim() === "1"
};
