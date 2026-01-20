import { Router } from "express";
import { z } from "zod";
import { newUid, createBackup, decryptBackup } from "./crypto.js";
import { walletsFor } from "./wallets.js";
import { newTotpSecret, otpauthUri, checkTotp, issueJwt, requireJwt } from "./auth.js";
import { policyRegisterUser } from "./sapphire.js";

type MemUser = {
  uid: string;
  totpSecret: string;
  totpConfirmed: boolean;
};

const mem = new Map<string, MemUser>();

export const routes = Router();

routes.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /v1/connect
 * - Creates uid
 * - Derives EVM + Solana wallets
 * - Generates TOTP secret + otpauth uri
 * - Creates encrypted backup file
 * - Registers commitments on Sapphire (ROFL mode)
 */
routes.post("/v1/connect", async (req, res) => {
  z.object({}).parse(req.body ?? {});

  const uid = newUid();
  const totpSecret = newTotpSecret();
  const totpUri = otpauthUri(uid, totpSecret);

  const wallets = await walletsFor(uid);
  const { backup, backupHash } = await createBackup(uid);

  // store in-memory (replace with DB later)
  mem.set(uid, { uid, totpSecret, totpConfirmed: false });

  // call contract (skipped in MOCK unless enabled)
  await policyRegisterUser({
    uid,
    totpSecret,
    backupHash,
    solPubkey32Hex: wallets.solana.pubkey32hex
  });

  res.json({
    uid,
    wallets,
    totp: { otpauth_uri: totpUri },
    backup_file: backup
  });
});

/**
 * POST /v1/totp/confirm
 * { uid, code }
 */
routes.post("/v1/totp/confirm", async (req, res) => {
  const body = z.object({ uid: z.string().min(8), code: z.string().min(6).max(8) }).parse(req.body);

  const u = mem.get(body.uid);
  if (!u) return res.status(404).json({ error: "unknown uid" });

  if (!checkTotp(body.code, u.totpSecret)) return res.status(401).json({ error: "bad code" });
  u.totpConfirmed = true;

  res.json({ ok: true });
});

/**
 * POST /v1/login
 * { uid, code }
 */
routes.post("/v1/login", async (req, res) => {
  const body = z.object({ uid: z.string().min(8), code: z.string().min(6).max(8) }).parse(req.body);

  const u = mem.get(body.uid);
  if (!u) return res.status(404).json({ error: "unknown uid" });
  if (!u.totpConfirmed) return res.status(403).json({ error: "totp not confirmed" });
  if (!checkTotp(body.code, u.totpSecret)) return res.status(401).json({ error: "bad code" });

  const token = await issueJwt(u.uid);
  res.json({ token });
});

/**
 * GET /v1/wallets
 * Authorization: Bearer <jwt>
 */
routes.get("/v1/wallets", async (req, res) => {
  const uid = await requireJwt(req.headers.authorization);
  const wallets = await walletsFor(uid);
  res.json({ uid, wallets });
});

/**
 * POST /v1/recovery/preview
 * Just validates backup file decrypts to uid
 * { backup_file }
 */
routes.post("/v1/recovery/preview", async (req, res) => {
  const body = z.object({ backup_file: z.any() }).parse(req.body);
  const payload = await decryptBackup(body.backup_file);
  res.json({ ok: true, payload });
});
