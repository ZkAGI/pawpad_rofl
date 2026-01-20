import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv
} from "node:crypto";
import { keccak256, toHex } from "viem";
import { deriveBytes32 } from "./keys.js";

export function newUid(): string {
  return randomBytes(16).toString("hex");
}

export function uidHash(uid: string): `0x${string}` {
  return keccak256(toHex(uid)) as `0x${string}`;
}

export function sha256HexBytes(buf: Buffer): `0x${string}` {
  return (`0x${createHash("sha256").update(buf).digest("hex")}` as `0x${string}`);
}

export type BackupFile = {
  v: 1;
  uid: string;
  nonce_b64: string;
  ct_b64: string;
  tag_b64: string;
};

async function backupKey(uid: string): Promise<Buffer> {
  const master = await deriveBytes32("pawpad:master:backup:v1");
  const key = createHash("sha256")
    .update(Buffer.concat([master, Buffer.from(uid, "utf8")]))
    .digest();
  return key; // 32 bytes
}

export async function createBackup(uid: string): Promise<{ backup: BackupFile; backupHash: `0x${string}` }> {
  const payload = { v: 1, uid, created_at: Math.floor(Date.now() / 1000) };
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
    tag_b64: tag.toString("base64url")
  };

  const raw = Buffer.from(JSON.stringify(backup), "utf8");
  const backupHash = sha256HexBytes(raw);

  return { backup, backupHash };
}

export async function decryptBackup(backup: BackupFile): Promise<any> {
  if (backup.v !== 1) throw new Error("bad backup version");
  const key = await backupKey(backup.uid);

  const nonce = Buffer.from(backup.nonce_b64, "base64url");
  const ct = Buffer.from(backup.ct_b64, "base64url");
  const tag = Buffer.from(backup.tag_b64, "base64url");

  const dec = createDecipheriv("aes-256-gcm", key, nonce);
  dec.setAuthTag(tag);

  const pt = Buffer.concat([dec.update(ct), dec.final()]);
  return JSON.parse(pt.toString("utf8"));
}
