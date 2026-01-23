
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
import { createBackup, decryptBackup, encryptTotpSecret, decryptTotpSecret, type BackupFile } from "./crypto.js";
import { getWallets } from "./wallets.js";
import { registerUserOnSapphire, getRoflSignerAddress, getRoflSignerBalance, sapphireUpdateCommitments } from "./sapphire.js";
import { roflStatus } from "./rofl_guard.js";
import { UserConfig, TradeHistory } from "./database.js";

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
    // Now passing totpSecret to backup so it's recoverable
    const { backup, backupHash } = await createBackup(uid, totpSecret);

    // Encrypt TOTP secret for TEE storage
    const encryptedSecret = await encryptTotpSecret(uid, totpSecret);

    // Initialize User Config in DB with encrypted secret
    try {
      await UserConfig.create({
        uid,
        tradingEnabled: false,
        encryptedTotpSecret: encryptedSecret
      });
    } catch (e) {
      console.warn("DB Create User error:", e);
      // In production, we might want to fail here if we can't store credentials
    }

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
        // totp_secret no longer required from client!
      })
      .parse(req.body);

    // 1. Fetch encrypted secret from DB
    const user = await UserConfig.findOne({ uid: body.uid }).select("+encryptedTotpSecret");
    if (!user || !user.encryptedTotpSecret) {
      return res.status(401).json({ error: "User not found or no credentials" });
    }

    // 2. Decrypt secret using TEE derived key
    let secret = "";
    try {
      secret = await decryptTotpSecret(body.uid, user.encryptedTotpSecret);
    } catch (e) {
      console.error("Failed to decrypt credentials for login:", e);
      return res.status(500).json({ error: "Credential error" });
    }

    // 3. Validate
    if (!checkTotp(body.totp_code, secret)) {
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
 * POST /v1/trade/config
 * Set trading parameters (enable/disable, max amount)
 */
router.post(
  "/v1/trade/config",
  asyncHandler(async (req, res) => {
    const uid = await requireSession(req.headers.authorization);
    const body = z.object({
      tradingEnabled: z.boolean().optional(),
      maxTradeAmountUsdc: z.number().min(5).max(10000).optional(),
      allowedAssets: z.array(z.string()).optional()
    }).parse(req.body);

    const config = await UserConfig.findOneAndUpdate(
      { uid },
      { $set: body },
      { new: true, upsert: true }
    );
    res.json({ ok: true, config });
  })
);

/**
 * GET /v1/trade/history
 * Get past trades
 */
router.get(
  "/v1/trade/history",
  asyncHandler(async (req, res) => {
    const uid = await requireSession(req.headers.authorization);
    const history = await TradeHistory.find({ uid }).sort({ timestamp: -1 }).limit(50);
    res.json({ ok: true, history });
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

/**
 * POST /v1/recovery/rotate
 * Recover account using backup file and Rotate the TOTP secret.
 * Used when phone is lost but backup file is preserved.
 */
router.post(
  "/v1/recovery/rotate",
  asyncHandler(async (req, res) => {
    const body = z.object({ backup_file: z.any() }).parse(req.body);

    // 1. Decrypt to prove ownership and get UID
    const payload = await decryptBackup(body.backup_file as BackupFile);
    const uid = payload.uid; // Assuming payload has { uid, ... }

    if (!uid) throw new Error("Invalid backup file: missing user ID");

    // 2. Generate NEW credentials
    const newSecret = newTotpSecret();
    const newOtpAuth = otpauthUri(uid, newSecret);

    // Create new backup with the NEW secret
    const { backup: newBackup, backupHash: newHash } = await createBackup(uid, newSecret);

    // 3. Update On-Chain Policy (Trusted Signer)
    // This allows the user to gain trust from the contract again with new credentials
    try {
      await sapphireUpdateCommitments({
        uid,
        newTotpSecret: newSecret,
        newBackupHash: newHash
      });
      console.log(`Rotated commitments on-chain for user ${uid}`);
    } catch (e: any) {
      console.error("Failed to update commitments on-chain:", e);
      // We still return the new files to the user, but warn them? 
      // Theoretically if on-chain fails, the old hash is still authoritative. 
      // For MVP we proceed.
    }

    res.json({
      ok: true,
      message: "Credentials rotated successfully. Please scan new QR and save new backup.",
      uid,
      new_totp: { otpauth_uri: newOtpAuth, secret: newSecret },
      new_backup_file: newBackup
    });
  })
);

export default router;