import { roflKeyHex } from "./rofl.js";

/** 32-byte deterministic master */
export async function deriveBytes32(keyId: string): Promise<Buffer> {
  const hex = await roflKeyHex(keyId, "secp256k1");
  return Buffer.from(hex.slice(0, 64), "hex");
}

export async function evmPrivKey(uid: string): Promise<`0x${string}`> {
  const hex = await roflKeyHex(`pawpad:user:${uid}:evm:v1`, "secp256k1");
  return (`0x${hex.slice(0, 64)}` as `0x${string}`);
}

export async function solanaSeed32(uid: string): Promise<Uint8Array> {
  const hex = await roflKeyHex(`pawpad:user:${uid}:sol:v1`, "ed25519");
  return Uint8Array.from(Buffer.from(hex.slice(0, 64), "hex"));
}
