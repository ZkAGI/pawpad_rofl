// import {
//   randomBytes,
//   createHash,
//   createCipheriv,
//   createDecipheriv
// } from "node:crypto";
// import { keccak256, toHex } from "viem";
// import { deriveBytes32 } from "./keys.js";

// export function newUid(): string {
//   return randomBytes(16).toString("hex");
// }

// export function uidHash(uid: string): `0x${string}` {
//   return keccak256(toHex(uid)) as `0x${string}`;
// }

// export function sha256HexBytes(buf: Buffer): `0x${string}` {
//   return (`0x${createHash("sha256").update(buf).digest("hex")}` as `0x${string}`);
// }

// export type BackupFile = {
//   v: 1;
//   uid: string;
//   nonce_b64: string;
//   ct_b64: string;
//   tag_b64: string;
// };

// async function backupKey(uid: string): Promise<Buffer> {
//   const master = await deriveBytes32("pawpad:master:backup:v1");
//   const key = createHash("sha256")
//     .update(Buffer.concat([master, Buffer.from(uid, "utf8")]))
//     .digest();
//   return key; // 32 bytes
// }

// export async function createBackup(uid: string): Promise<{ backup: BackupFile; backupHash: `0x${string}` }> {
//   const payload = { v: 1, uid, created_at: Math.floor(Date.now() / 1000) };
//   const pt = Buffer.from(JSON.stringify(payload), "utf8");

//   const key = await backupKey(uid);
//   const nonce = randomBytes(12);
//   const cipher = createCipheriv("aes-256-gcm", key, nonce);
//   const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
//   const tag = cipher.getAuthTag();

//   const backup: BackupFile = {
//     v: 1,
//     uid,
//     nonce_b64: nonce.toString("base64url"),
//     ct_b64: ct.toString("base64url"),
//     tag_b64: tag.toString("base64url")
//   };

//   const raw = Buffer.from(JSON.stringify(backup), "utf8");
//   const backupHash = sha256HexBytes(raw);

//   return { backup, backupHash };
// }

// export async function decryptBackup(backup: BackupFile): Promise<any> {
//   if (backup.v !== 1) throw new Error("bad backup version");
//   const key = await backupKey(backup.uid);

//   const nonce = Buffer.from(backup.nonce_b64, "base64url");
//   const ct = Buffer.from(backup.ct_b64, "base64url");
//   const tag = Buffer.from(backup.tag_b64, "base64url");

//   const dec = createDecipheriv("aes-256-gcm", key, nonce);
//   dec.setAuthTag(tag);

//   const pt = Buffer.concat([dec.update(ct), dec.final()]);
//   return JSON.parse(pt.toString("utf8"));
// }

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deriveBackupMasterHex } from "./keys.js";
import { keccak256, toHex } from "viem";

export function uidHash(uid: string): `0x${string}` {
  return keccak256(toHex(uid));
}

export function sha256Hex(buf: Buffer): `0x${string}` {
  const h = createHash("sha256").update(buf).digest("hex");
  return (`0x${h}` as `0x${string}`);
}

async function backupKey(uid: string): Promise<Buffer> {
  const masterHex = await deriveBackupMasterHex(); // 32 bytes hex
  const master = Buffer.from(masterHex.slice(0, 64), "hex");
  return createHash("sha256").update(Buffer.concat([master, Buffer.from(uid, "utf8")])).digest();
}

export type BackupFile = {
  v: 1;
  uid: string;
  // Encrypted payload now may include secrets
  nonce_b64: string;
  ct_b64: string;
  tag_b64: string;
};

export async function createBackup(uid: string, totpSecret: string): Promise<{ backup: BackupFile; backupHash: `0x${string}` }> {
  // We store the secret in the encrypted payload so user can restore it
  const payload = { v: 1 as const, uid, totpSecret, created_at: Math.floor(Date.now() / 1000) };
  const pt = Buffer.from(JSON.stringify(payload), "utf8");

  const key = await backupKey(uid);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();

  const backup: BackupFile = {
    v: 1,
    uid,
    nonce_b64: nonce.toString("base64url"),
    ct_b64: ct.toString("base64url"),
    tag_b64: tag.toString("base64url"),
  };

  const raw = Buffer.from(JSON.stringify(backup), "utf8");
  return { backup, backupHash: sha256Hex(raw) };
}

export async function decryptBackup(backup: BackupFile): Promise<any> {
  const key = await backupKey(backup.uid);
  const nonce = Buffer.from(backup.nonce_b64, "base64url");
  const ct = Buffer.from(backup.ct_b64, "base64url");
  const tag = Buffer.from(backup.tag_b64, "base64url");

  const dec = createDecipheriv("aes-256-gcm", key, nonce);
  dec.setAuthTag(tag);
  const pt = Buffer.concat([dec.update(ct), dec.final()]);
  return JSON.parse(pt.toString("utf8"));
}

// --- Secure Key storage helper ---
// Uses a different key derivation context than backups
async function storageKey(uid: string): Promise<Buffer> {
  const masterHex = await deriveBackupMasterHex(); // Re-use master root, but diff context
  const master = Buffer.from(masterHex.slice(0, 64), "hex");
  // Context string is different to ensure key separation
  return createHash("sha256").update(Buffer.concat([master, Buffer.from(`pawpad:storage:${uid}`, "utf8")])).digest();
}

export async function encryptTotpSecret(uid: string, secret: string): Promise<string> {
  const key = await storageKey(uid);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.from(secret, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: nonce_b64:ct_b64:tag_b64
  return `${nonce.toString("base64url")}:${ct.toString("base64url")}:${tag.toString("base64url")}`;
}

export async function decryptTotpSecret(uid: string, blob: string): Promise<string> {
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("Invalid storage blob format");

  const key = await storageKey(uid);
  const nonce = Buffer.from(parts[0], "base64url");
  const ct = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");

  const dec = createDecipheriv("aes-256-gcm", key, nonce);
  dec.setAuthTag(tag);
  const pt = Buffer.concat([dec.update(ct), dec.final()]);
  return pt.toString("utf8");
}
