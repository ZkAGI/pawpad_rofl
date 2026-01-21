
// import { Router } from "express";
// import { z } from "zod";
// import { asyncHandler } from "./util/asyncHandler.js";

// import { newUid } from "./keys.js";
// import { newTotpSecret, otpauthUri, checkTotp, issueSession, requireSession } from "./auth.js";
// import { createBackup, decryptBackup, type BackupFile } from "./crypto.js";
// import { getWallets } from "./wallets.js";
// import { registerUserOnSapphire } from "./sapphire.js";
// import { roflStatus } from "./rofl_guard.js";

// const router = Router();

// /**
//  * GET /v1/rofl/status - helpful to confirm ROFL is reachable inside ROFL runtime
//  */
// router.get(
//   "/v1/rofl/status",
//   asyncHandler(async (_req, res) => {
//     res.json(await roflStatus());
//   })
// );

// /**
//  * POST /v1/connect
//  * returns uid + wallets + otpauth uri + backup.json
//  */
// router.post(
//   "/v1/connect",
//   asyncHandler(async (req, res) => {
//     z.object({}).parse(req.body || {});
//     const uid = newUid();

//     const totpSecret = newTotpSecret();
//     const otpauth = otpauthUri(uid, totpSecret);

//     const wallets = await getWallets(uid);
//     const { backup, backupHash } = await createBackup(uid);

//     // best effort register on Sapphire (ROFL tx)
//     let sapphire: any = undefined;
//     try {
//       sapphire = await registerUserOnSapphire({
//         uid,
//         evmAddress: wallets.evm.address,
//         solanaAddressBase58: wallets.solana.address,
//         totpSecret,
//         backupHash,
//       });
//     } catch (e) {
//       console.warn("registerUserOnSapphire error:", String(e));
//     }

//     res.json({
//       uid,
//       wallets,
//       totp: { otpauth_uri: otpauth },
//       backup_file: backup,
//       backup_hash: backupHash,
//       sapphire, // added (undefined if best-effort failed)
//     });
//   })
// );

// /**
//  * POST /v1/login
//  * body: { uid, totp_code } -> bearer token
//  *
//  * NOTE: this minimal version expects you to still have totpSecret (not stored server-side).
//  * For production: store encrypted TOTP secret in ROFL persistent DB.
//  */
// router.post(
//   "/v1/login",
//   asyncHandler(async (req, res) => {
//     const body = z
//       .object({ uid: z.string(), totp_code: z.string().min(6).max(8), totp_secret: z.string() })
//       .parse(req.body);
//     if (!checkTotp(body.totp_code, body.totp_secret)) return res.status(401).json({ error: "bad totp" });
//     const token = await issueSession(body.uid);
//     res.json({ token });
//   })
// );

// /**
//  * GET /v1/wallets (requires Bearer)
//  */
// router.get(
//   "/v1/wallets",
//   asyncHandler(async (req, res) => {
//     const uid = await requireSession(req.headers.authorization);
//     const wallets = await getWallets(uid);
//     res.json({ uid, wallets });
//   })
// );

// /**
//  * POST /v1/recovery/decrypt
//  * body: { backup_file } -> decrypts inside ROFL and returns uid (demo)
//  */
// router.post(
//   "/v1/recovery/decrypt",
//   asyncHandler(async (req, res) => {
//     const body = z.object({ backup_file: z.any() }).parse(req.body);
//     const payload = await decryptBackup(body.backup_file as BackupFile);
//     res.json({ ok: true, payload });
//   })
// );

// export default router;

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "./util/asyncHandler.js";
import { newUid } from "./keys.js";
import { newTotpSecret, otpauthUri, checkTotp, issueSession, requireSession } from "./auth.js";
import { createBackup, decryptBackup, type BackupFile } from "./crypto.js";
import { getWallets } from "./wallets.js";
import { registerUserOnSapphire, getRoflSignerAddress, getRoflSignerBalance } from "./sapphire.js";
import { roflStatus } from "./rofl_guard.js";

const router = Router();

/**
 * GET /health - Simple health check
 */
router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  })
);

/**
 * GET /v1/rofl/status - Confirm ROFL is reachable inside ROFL runtime
 */
router.get(
  "/v1/rofl/status",
  asyncHandler(async (_req, res) => {
    res.json(await roflStatus());
  })
);

/**
 * GET /v1/rofl/signer - Get ROFL signer info for Sapphire transactions
 * Returns the address and balance of the TEE-derived signing key
 */
router.get(
  "/v1/rofl/signer",
  asyncHandler(async (_req, res) => {
    try {
      const address = await getRoflSignerAddress();
      const balance = await getRoflSignerBalance();
      res.json({
        ok: true,
        signer: {
          address,
          balance,
          balanceFormatted: `${(BigInt(balance) / 10n ** 18n).toString()} ROSE`,
        },
        note: balance === "0"
          ? `Please fund ${address} with TEST ROSE from https://faucet.testnet.oasis.io/`
          : undefined,
      });
    } catch (error: any) {
      res.status(500).json({
        ok: false,
        error: error.message,
        hint: "ROFL signer initialization failed - check ROFL socket connection",
      });
    }
  })
);

/**
 * POST /v1/connect
 * Creates a new PawPad wallet: returns uid + wallets + otpauth uri + backup.json
 * Also registers the user on Sapphire (best effort)
 */
router.post(
  "/v1/connect",
  asyncHandler(async (req, res) => {
    z.object({}).parse(req.body || {});

    const uid = newUid();
    const totpSecret = newTotpSecret();
    const otpauth = otpauthUri(uid, totpSecret);
    const wallets = await getWallets(uid);
    const { backup, backupHash } = await createBackup(uid);

    // Best effort: register on Sapphire via ROFL TEE transaction
    let sapphire: any = undefined;
    try {
      sapphire = await registerUserOnSapphire({
        uid,
        evmAddress: wallets.evm.address as `0x${string}`,
        solanaAddressBase58: wallets.solana.address,
        totpSecret,
        backupHash,
      });
      console.log(`User ${uid} registered on Sapphire successfully`);
    } catch (e: any) {
      console.warn("registerUserOnSapphire error:", e.message || String(e));
      // Include error info in response so client knows registration failed
      sapphire = {
        ok: false,
        error: e.message || String(e),
      };
    }

    res.json({
      uid,
      wallets,
      totp: { otpauth_uri: otpauth },
      backup_file: backup,
      backup_hash: backupHash,
      sapphire,
    });
  })
);

/**
 * POST /v1/login
 * Authenticate with TOTP and get a session token
 * body: { uid, totp_code, totp_secret } -> bearer token
 *
 * NOTE: This minimal version expects the client to provide totp_secret.
 * For production: store encrypted TOTP secret in ROFL persistent storage
 * and only require uid + totp_code.
 */
router.post(
  "/v1/login",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        uid: z.string().min(1),
        totp_code: z.string().min(6).max(8),
        totp_secret: z.string().min(1),
      })
      .parse(req.body);

    if (!checkTotp(body.totp_code, body.totp_secret)) {
      return res.status(401).json({ error: "Invalid TOTP code" });
    }

    const token = await issueSession(body.uid);
    res.json({ token });
  })
);

/**
 * GET /v1/wallets - Get wallet addresses for authenticated user
 * Requires: Bearer token from /v1/login
 */
router.get(
  "/v1/wallets",
  asyncHandler(async (req, res) => {
    const uid = await requireSession(req.headers.authorization);
    const wallets = await getWallets(uid);
    res.json({ uid, wallets });
  })
);

/**
 * POST /v1/recovery/decrypt
 * Decrypt a backup file inside ROFL TEE
 * body: { backup_file } -> decrypted payload
 */
router.post(
  "/v1/recovery/decrypt",
  asyncHandler(async (req, res) => {
    const body = z.object({ backup_file: z.any() }).parse(req.body);
    const payload = await decryptBackup(body.backup_file as BackupFile);
    res.json({ ok: true, payload });
  })
);

export default router;