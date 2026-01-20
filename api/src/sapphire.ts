import { encodeFunctionData } from "viem";
import { CFG } from "./config.js";
import { roflTxSignSubmitEth } from "./rofl.js";
import { uidHash } from "./crypto.js";
import { keccak256, toHex } from "viem";

export const PolicyAbi = [
  {
    type: "function",
    name: "registerUser",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "totpHash", type: "bytes32" },
      { name: "backupHash", type: "bytes32" },
      { name: "solPubkey", type: "bytes32" },
      { name: "dailyLimit", type: "uint256" }
    ],
    outputs: []
  }
] as const;

export const AuditAbi = [
  {
    type: "function",
    name: "recordExecution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "action", type: "string" },
      { name: "execHash", type: "bytes32" },
      { name: "meta", type: "string" }
    ],
    outputs: []
  }
] as const;

export function totpHash(secret: string): `0x${string}` {
  return keccak256(toHex(secret)) as `0x${string}`;
}

export async function policyRegisterUser(args: {
  uid: string;
  totpSecret: string;
  backupHash: `0x${string}`;
  solPubkey32Hex: string; // 64 hex chars
}): Promise<{ tx_hash: string } | null> {
  if (!CFG.policyContract) return null;

  // In local mock mode, skip chain calls unless explicitly enabled.
  if (CFG.mockRofl && !CFG.enableChainCallsInMock) return null;

  const solBytes32 = (`0x${args.solPubkey32Hex}` as `0x${string}`);

  const data = encodeFunctionData({
    abi: PolicyAbi,
    functionName: "registerUser",
    args: [uidHash(args.uid), totpHash(args.totpSecret), args.backupHash, solBytes32, 0n]
  });

  return await roflTxSignSubmitEth({ to: CFG.policyContract, data });
}

export async function audit(action: string, uid: string, execHash: `0x${string}`, meta = ""): Promise<void> {
  if (!CFG.auditContract) return;
  if (CFG.mockRofl && !CFG.enableChainCallsInMock) return;

  const data = encodeFunctionData({
    abi: AuditAbi,
    functionName: "recordExecution",
    args: [uidHash(uid), action, execHash, meta]
  });

  await roflTxSignSubmitEth({ to: CFG.auditContract, data });
}
