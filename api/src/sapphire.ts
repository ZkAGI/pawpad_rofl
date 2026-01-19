import { encodeFunctionData, keccak256, toHex } from "viem";
import { CFG } from "./config.js";
import { roflSignSubmitEthTx } from "./rofl.js";

const PolicyAbi = [
  {
    type: "function",
    name: "registerUser",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "evmAddress", type: "address" },
      { name: "solanaPubkey", type: "bytes32" },
      { name: "totpSecretHash", type: "bytes32" },
      { name: "backupBlobHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "startRecovery",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "timelockSeconds", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "completeRecovery",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "newTotpSecretHash", type: "bytes32" }
    ],
    outputs: []
  }
] as const;

const AuditAbi = [
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

function totpSecretHash(secret: string): `0x${string}` {
  return keccak256(toHex(secret));
}

export async function policyRegisterUser(args: {
  uidHash: `0x${string}`;
  evmAddress: `0x${string}`;
  solanaPubkey32: `0x${string}`;
  totpSecret: string;
  backupHash: `0x${string}`;
}) {
  if (!CFG.policyContract || CFG.policyContract === "0x0000000000000000000000000000000000000000") {
    return { skipped: true };
  }
  const data = encodeFunctionData({
    abi: PolicyAbi,
    functionName: "registerUser",
    args: [args.uidHash, args.evmAddress, args.solanaPubkey32, totpSecretHash(args.totpSecret), args.backupHash]
  });
  return await roflSignSubmitEthTx(CFG.policyContract, data);
}

export async function policyStartRecovery(uidHash: `0x${string}`) {
  const data = encodeFunctionData({
    abi: PolicyAbi,
    functionName: "startRecovery",
    args: [uidHash, BigInt(CFG.recoveryTimelockSeconds) as any]
  });
  return await roflSignSubmitEthTx(CFG.policyContract, data);
}

export async function policyCompleteRecovery(uidHash: `0x${string}`, newTotpSecret: string) {
  const data = encodeFunctionData({
    abi: PolicyAbi,
    functionName: "completeRecovery",
    args: [uidHash, totpSecretHash(newTotpSecret)]
  });
  return await roflSignSubmitEthTx(CFG.policyContract, data);
}

export async function audit(uidHash: `0x${string}`, action: string, execHash: `0x${string}`, meta: string) {
  if (!CFG.auditContract || CFG.auditContract === "0x0000000000000000000000000000000000000000") {
    return { skipped: true };
  }
  const data = encodeFunctionData({
    abi: AuditAbi,
    functionName: "recordExecution",
    args: [uidHash, action, execHash, meta]
  });
  return await roflSignSubmitEthTx(CFG.auditContract, data);
}

