export const CFG = {
  port: Number(process.env.PORT || 8080),
  roflSocket: process.env.ROFL_APPD_SOCKET || "/run/rofl-appd.sock",

  sapphireRpc: (process.env.SAPPHIRE_RPC_URL || "").trim(),
  sapphireChainId: Number(process.env.SAPPHIRE_CHAIN_ID || 0),

  roflAppIdBytes21: (process.env.ROFL_APP_ID_BYTES21 || "").trim(),
  policyContract: (process.env.POLICY_CONTRACT || "").trim(),
  auditContract: (process.env.AUDIT_CONTRACT || "").trim(),

  recoveryTimelockSeconds: Number(process.env.RECOVERY_TIMELOCK_SECONDS || 86400),
  jwtTtlMinutes: Number(process.env.JWT_TTL_MINUTES || 30)
};

