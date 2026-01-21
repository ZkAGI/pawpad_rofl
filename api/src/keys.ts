// import { roflKeyHex } from "./rofl.js";

// /** 32-byte deterministic master */
// export async function deriveBytes32(keyId: string): Promise<Buffer> {
//   const hex = await roflKeyHex(keyId, "secp256k1");
//   return Buffer.from(hex.slice(0, 64), "hex");
// }

// export async function evmPrivKey(uid: string): Promise<`0x${string}`> {
//   const hex = await roflKeyHex(`pawpad:user:${uid}:evm:v1`, "secp256k1");
//   return (`0x${hex.slice(0, 64)}` as `0x${string}`);
// }

// export async function solanaSeed32(uid: string): Promise<Uint8Array> {
//   const hex = await roflKeyHex(`pawpad:user:${uid}:sol:v1`, "ed25519");
//   return Uint8Array.from(Buffer.from(hex.slice(0, 64), "hex"));
// }

import { CFG } from "./config.js";
import { roflKeyGenerate } from "./rofl.js";
import { randomBytes } from "node:crypto";

export function newUid(): string {
  return randomBytes(16).toString("hex"); // 32 hex chars
}

/**
 * Normalize a hex key - remove 0x prefix if present and ensure clean hex
 */
function normalizeHexKey(key: string): string {
  let hex = key.startsWith("0x") ? key.slice(2) : key;
  hex = hex.trim().replace(/\s/g, "");
  return hex;
}

/**
 * If MOCK_ROFL=1: returns random ephemeral keys so you can test locally
 * If MOCK_ROFL=0: derives deterministic keys via ROFL KMS
 */
export async function deriveEvmPrivKeyHex(uid: string): Promise<string> {
  if (CFG.mockRofl) return randomBytes(32).toString("hex");
  const key = await roflKeyGenerate(`pawpad:user:${uid}:evm:v1`, "secp256k1");
  return normalizeHexKey(key);
}

export async function deriveSolanaPrivKeyHex(uid: string): Promise<string> {
  if (CFG.mockRofl) return randomBytes(32).toString("hex");
  const key = await roflKeyGenerate(`pawpad:user:${uid}:sol:v1`, "ed25519");
  return normalizeHexKey(key);
}

export async function deriveBackupMasterHex(): Promise<string> {
  if (CFG.mockRofl) return randomBytes(32).toString("hex");
  const key = await roflKeyGenerate("pawpad:master:backup:v1", "secp256k1");
  return normalizeHexKey(key);
}
