import { Router } from "express";
import { z } from "zod";

import { newUid, uidHash, createBackup, decryptBackup, BackupFile } from "./crypto.js";
import { newTotpSecret, otpauthUri, verifyTotp, issueJwt, requireJwt } from "./auth.js";
import { deriveWallets } from "./wallets.js";
import { policyRegisterUser, policyStartRecovery, policyCompleteRecovery, audit } from "./sapphire.js";

export const routes = Router();

// Health
routes.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /v1/connect
 * Creates uid + derives EVM+Solana keys inside ROFL + registers commitments on-chain.
 */
routes.post("/v1/connect", async (req, res) => {
  z.object({}).parse(req.body || {});
  const uid = newUid();
  const uidH = uidHash(uid);

  const totpSecret = newTotpSecret();
  const otpUri = otpauthUri(uid, totpSecret);

  const w = await deriveWallets(uid);
  const { backup, backupHash } = await createBackup(uid);

  const onchain = await policyRegisterUser({
    uidHash: uidH,
    evmAddress: w.evmAddress,
    solanaPubkey32: w.solanaPubkey32,
    totpSecret,
    backupHash
  });

  await audit(uidH, "connect", uidH, `evm=${w.evmAddress} sol=${w.solanaAddress}`);

  res.json({
    uid,
    uid_hash: uidH,
    wallets: {
      evm: { address: w.evmAddress },
      solana: { address: w.solanaAddress }
    },
    totp: { otpauth_uri: otpUri, secret: totpSecret }, // ✅ for now; remove later when you store inside ROFL
    backup_file: backup,
    onchain
  });
});

/**
 * POST /v1/login
 * Minimal login = backup_file + totp secret + code -> JWT
 * (Next upgrade: store totp secret inside ROFL and remove `totp_secret` from request)
 */
routes.post("/v1/login", async (req, res) => {
  const body = z
    .object({
      backup_file: z.any(),
      totp_secret: z.string().min(10),
      code: z.string().min(6).max(8)
    })
    .parse(req.body);

  const { uid } = await decryptBackup(body.backup_file as BackupFile);
  if (!verifyTotp(body.code, body.totp_secret)) return res.status(401).json({ error: "bad totp" });

  const token = await issueJwt(uid);
  res.json({ token, uid });
});

/**
 * GET /v1/wallets
 * Auth: Bearer JWT
 */
routes.get("/v1/wallets", async (req, res) => {
  const uid = await requireJwt(req.headers.authorization);
  const w = await deriveWallets(uid);
  res.json({
    uid,
    wallets: {
      evm: { address: w.evmAddress },
      solana: { address: w.solanaAddress }
    }
  });
});

/**
 * Recovery start: freezes user on-chain (timelock)
 */
routes.post("/v1/recovery/start", async (req, res) => {
  const body = z
    .object({ backup_file: z.any(), totp_secret: z.string().min(10), code: z.string().min(6).max(8) })
    .parse(req.body);

  const { uid } = await decryptBackup(body.backup_file as BackupFile);
  if (!verifyTotp(body.code, body.totp_secret)) return res.status(401).json({ error: "bad totp" });

  const uidH = uidHash(uid);
  const onchain = await policyStartRecovery(uidH);
  await audit(uidH, "recovery_start", uidH, "freeze+timelock");

  res.json({ ok: true, uid, uid_hash: uidH, onchain });
});

/**
 * Recovery complete: rotates TOTP on-chain (timelock must have passed)
 */
routes.post("/v1/recovery/complete", async (req, res) => {
  const body = z
    .object({ backup_file: z.any(), old_totp_secret: z.string().min(10), code: z.string().min(6).max(8) })
    .parse(req.body);

  const { uid } = await decryptBackup(body.backup_file as BackupFile);
  if (!verifyTotp(body.code, body.old_totp_secret)) return res.status(401).json({ error: "bad totp" });

  const uidH = uidHash(uid);

  const newSecret = newTotpSecret();
  const uri = otpauthUri(uid, newSecret);

  const onchain = await policyCompleteRecovery(uidH, newSecret);
  await audit(uidH, "recovery_complete", uidH, "rotate_totp_unfreeze");

  res.json({ ok: true, uid, uid_hash: uidH, new_totp: { otpauth_uri: uri, secret: newSecret }, onchain });
});

