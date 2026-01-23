# PawPad ROFL - System Architecture

This document provides a detailed breakdown of the PawPad system architecture, data flows, and component interactions.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Component Breakdown](#component-breakdown)
3. [Flow 1: User Registration](#flow-1-user-registration)
4. [Flow 2: User Login](#flow-2-user-login)
5. [Flow 3: Wallet Address Retrieval](#flow-3-wallet-address-retrieval)
6. [Flow 4: Automated Trading](#flow-4-automated-trading)
7. [Flow 5: Account Recovery](#flow-5-account-recovery)
8. [Security Architecture](#security-architecture)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   USER LAYER                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │                         Mobile Application                             │     │
│  │   • React Native / Flutter                                             │     │
│  │   • Stores: uid (local), session token                                 │     │
│  │   • NO private keys or secrets                                         │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               BACKEND LAYER                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │                    ROFL TEE Runtime (SGX/TDX)                          │     │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │     │
│  │  │  Node.js Express API                                             │  │     │
│  │  │  • /v1/connect, /v1/login, /v1/wallets, etc.                     │  │     │
│  │  │  • Key derivation via ROFL KMS                                   │  │     │
│  │  │  • Transaction signing in-memory                                 │  │     │
│  │  └──────────────────────────────────────────────────────────────────┘  │     │
│  │                              │                                          │     │
│  │  ┌───────────────────────────▼────────────────────────────────────┐    │     │
│  │  │  rofl-appd (Unix Socket: /run/rofl-appd.sock)                  │    │     │
│  │  │  • /rofl/v1/keys/generate - Deterministic key derivation       │    │     │
│  │  │  • /rofl/v1/app/id - App identity                              │    │     │
│  │  └────────────────────────────────────────────────────────────────┘    │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│      MongoDB         │ │   Oasis Sapphire     │ │   External Chains    │
│  ┌────────────────┐  │ │  ┌────────────────┐  │ │  ┌────────────────┐  │
│  │ UserConfig     │  │ │  │ PawPadPolicy   │  │ │  │ Base Network   │  │
│  │ TradeHistory   │  │ │  │ PawPadAudit    │  │ │  │ (Uniswap)      │  │
│  │ SignalLog      │  │ │  └────────────────┘  │ │  ├────────────────┤  │
│  └────────────────┘  │ │                      │ │  │ Solana         │  │
│                      │ │                      │ │  │ (Jupiter)      │  │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
```

---

## Component Breakdown

### Mobile Application
- **Technology**: React Native or Flutter
- **Responsibilities**:
  - User interface for onboarding, login, and trading configuration
  - QR code display for TOTP setup
  - Backup file download/upload handling
- **Security**:
  - Stores only `uid` and temporary session token
  - Never handles private keys or TOTP secrets

### ROFL TEE Backend
- **Technology**: Node.js, Express, TypeScript
- **Runtime**: Oasis ROFL (SGX/TDX enclave)
- **Key Files**:
  | File | Purpose |
  |------|---------|
  | `index.ts` | Application entry, scheduler initialization |
  | `routes.ts` | HTTP endpoint handlers |
  | `keys.ts` | Key derivation via ROFL KMS |
  | `wallets.ts` | Address computation from derived keys |
  | `auth.ts` | TOTP validation, JWT issuance |
  | `crypto.ts` | Backup encryption, secret storage encryption |
  | `trading.ts` | Automated swap execution |
  | `sapphire.ts` | On-chain contract interactions |
  | `rofl.ts` | ROFL daemon communication |

### MongoDB
- **Collections**:
  - `UserConfig`: Trading preferences, encrypted TOTP secret
  - `TradeHistory`: Executed trade records
  - `SignalLog`: Raw signal data for debugging

### Oasis Sapphire Contracts
- **PawPadPolicy.sol**: Identity registry with trusted signer enforcement
- **PawPadAudit.sol**: Immutable trade execution logs

### External Chains
- **Base**: EVM-compatible, Uniswap V2 router for ETH/USDC swaps
- **Solana**: (Planned) Jupiter aggregator integration

---

## Flow 1: User Registration

```
┌──────────────┐          ┌──────────────────────┐          ┌─────────────┐          ┌───────────────┐
│  Mobile App  │          │   ROFL TEE Backend   │          │   MongoDB   │          │   Sapphire    │
└──────┬───────┘          └──────────┬───────────┘          └──────┬──────┘          └───────┬───────┘
       │                             │                             │                         │
       │  POST /v1/connect           │                             │                         │
       │────────────────────────────>│                             │                         │
       │                             │                             │                         │
       │                             │  1. Generate UID            │                         │
       │                             │     newUid() → "abc123..."  │                         │
       │                             │                             │                         │
       │                             │  2. Generate TOTP Secret    │                         │
       │                             │     newTotpSecret()         │                         │
       │                             │                             │                         │
       │                             │  3. Derive Wallets          │                         │
       │                             │     roflKeyGenerate(evm)    │                         │
       │                             │     roflKeyGenerate(sol)    │                         │
       │                             │     → Compute addresses     │                         │
       │                             │                             │                         │
       │                             │  4. Create Encrypted Backup │                         │
       │                             │     createBackup(uid, totp) │                         │
       │                             │                             │                         │
       │                             │  5. Encrypt TOTP for DB     │                         │
       │                             │     encryptTotpSecret()     │                         │
       │                             │                             │                         │
       │                             │  6. Store in DB             │                         │
       │                             │─────────────────────────────>│                         │
       │                             │     UserConfig.create()     │                         │
       │                             │                             │                         │
       │                             │  7. Register on Sapphire    │                         │
       │                             │─────────────────────────────────────────────────────────>
       │                             │     PawPadPolicy.registerUser()                       │
       │                             │     (uidHash, evmAddr, solPubkey, totpHash, backupHash)
       │                             │                             │                         │
       │<────────────────────────────│                             │                         │
       │  Response:                  │                             │                         │
       │  {                          │                             │                         │
       │    uid,                     │                             │                         │
       │    wallets: {evm, solana},  │                             │                         │
       │    totp: {otpauth_uri},     │                             │                         │
       │    backup_file              │                             │                         │
       │  }                          │                             │                         │
       │                             │                             │                         │
```

**Post-Registration (Client Side)**:
1. Display QR code from `otpauth_uri` for Google Authenticator
2. Prompt user to save `backup_file` to cloud storage
3. Store `uid` in local secure storage

---

## Flow 2: User Login

```
┌──────────────┐          ┌──────────────────────┐          ┌─────────────┐
│  Mobile App  │          │   ROFL TEE Backend   │          │   MongoDB   │
└──────┬───────┘          └──────────┬───────────┘          └──────┬──────┘
       │                             │                             │
       │  POST /v1/login             │                             │
       │  {uid, totp_code: "123456"} │                             │
       │────────────────────────────>│                             │
       │                             │                             │
       │                             │  1. Fetch User              │
       │                             │     UserConfig.findOne()    │
       │                             │─────────────────────────────>│
       │                             │<─────────────────────────────│
       │                             │     {encryptedTotpSecret}   │
       │                             │                             │
       │                             │  2. Decrypt Secret          │
       │                             │     decryptTotpSecret()     │
       │                             │     (Uses TEE master key)   │
       │                             │                             │
       │                             │  3. Validate TOTP           │
       │                             │     checkTotp(code, secret) │
       │                             │                             │
       │                             │  4. Issue Session Token     │
       │                             │     issueSession(uid)       │
       │                             │     (JWT signed with TEE key)
       │                             │                             │
       │<────────────────────────────│                             │
       │  {token: "eyJhbGciOi..."}   │                             │
       │                             │                             │
```

**Security Notes**:
- TOTP secret never sent by client
- Decryption key only accessible inside TEE
- JWT expires in 60 minutes

---

## Flow 3: Wallet Address Retrieval

```
┌──────────────┐          ┌──────────────────────┐
│  Mobile App  │          │   ROFL TEE Backend   │
└──────┬───────┘          └──────────┬───────────┘
       │                             │
       │  GET /v1/wallets            │
       │  Authorization: Bearer xxx  │
       │────────────────────────────>│
       │                             │
       │                             │  1. Verify JWT
       │                             │     requireSession(token)
       │                             │     → Extract uid
       │                             │
       │                             │  2. Derive Keys (On-Demand)
       │                             │     deriveEvmPrivKeyHex(uid)
       │                             │     deriveSolanaPrivKeyHex(uid)
       │                             │
       │                             │  3. Compute Addresses Only
       │                             │     privateKeyToAccount()
       │                             │     Keypair.fromSeed()
       │                             │     → Return public addresses
       │                             │     → Discard private keys
       │                             │
       │<────────────────────────────│
       │  {                          │
       │    evm: {address: "0x..."},│
       │    solana: {address: "..."}│
       │  }                          │
       │                             │
```

**Key Insight**: Private keys are derived, used to compute addresses, and immediately garbage collected. Never stored.

---

## Flow 4: Automated Trading

```
┌───────────────┐     ┌────────────────┐     ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ Cron (4hr)    │     │ Signal API     │     │  MongoDB    │     │ Base Network │     │   Sapphire    │
└───────┬───────┘     └───────┬────────┘     └──────┬──────┘     └──────┬───────┘     └───────┬───────┘
        │                     │                     │                   │                     │
        │  Trigger            │                     │                   │                     │
        │─────────────────────│                     │                   │                     │
        │                     │                     │                   │                     │
        │  GET /api/signals/ETH                     │                   │                     │
        │─────────────────────>                     │                   │                     │
        │<─────────────────────                     │                   │                     │
        │  {signal: "BUY", price: 3000}             │                   │                     │
        │                     │                     │                   │                     │
        │  Query Active Users │                     │                   │                     │
        │─────────────────────────────────────────────>                 │                     │
        │<─────────────────────────────────────────────                 │                     │
        │  [user1, user2, ...]│                     │                   │                     │
        │                     │                     │                   │                     │
        │  ┌─────────────────────────────────────────────────────────────────────────────┐   │
        │  │  FOR EACH USER:                                                             │   │
        │  │                                                                             │   │
        │  │  1. deriveEvmPrivKeyHex(uid)                                                │   │
        │  │     → Private key in memory only                                            │   │
        │  │                                                                             │   │
        │  │  2. Connect to Base RPC                                                     │   │
        │  │     new Wallet(pk, provider)                                                │   │
        │  │                                                                             │   │
        │  │  3. Execute Swap                                                            │   │
        │  │───────────────────────────────────────────────────────────>│                │   │
        │  │     router.swapExactTokensForETH(...)                      │                │   │
        │  │<───────────────────────────────────────────────────────────│                │   │
        │  │     txHash: "0xabc..."                                     │                │   │
        │  │                                                             │                │   │
        │  │  4. Record to DB                                            │                │   │
        │  │─────────────────────────────────────────>│                  │                │   │
        │  │     TradeHistory.create()                │                  │                │   │
        │  │                                          │                  │                │   │
        │  │  5. Record On-Chain Audit                │                  │                │   │
        │  │────────────────────────────────────────────────────────────────────────────────>│
        │  │     PawPadAudit.recordExecution()                                           │   │
        │  │                                                                             │   │
        │  └─────────────────────────────────────────────────────────────────────────────┘   │
        │                     │                     │                   │                     │
```

**Trading Logic**:
- **BUY Signal**: Swap user's USDC → ETH (up to `maxTradeAmountUsdc`)
- **SELL Signal**: Swap ETH → USDC (up to equivalent USD value)
- **HOLD Signal**: No action

---

## Flow 5: Account Recovery

```
┌──────────────┐          ┌──────────────────────┐          ┌─────────────┐          ┌───────────────┐
│  New Device  │          │   ROFL TEE Backend   │          │   MongoDB   │          │   Sapphire    │
└──────┬───────┘          └──────────┬───────────┘          └──────┬──────┘          └───────┬───────┘
       │                             │                             │                         │
       │  POST /v1/recovery/rotate   │                             │                         │
       │  {backup_file: {...}}       │                             │                         │
       │────────────────────────────>│                             │                         │
       │                             │                             │                         │
       │                             │  1. Decrypt Backup          │                         │
       │                             │     decryptBackup()         │                         │
       │                             │     (TEE master key)        │                         │
       │                             │     → Extract uid           │                         │
       │                             │     → PROVES OWNERSHIP      │                         │
       │                             │                             │                         │
       │                             │  2. Generate New Secret     │                         │
       │                             │     newTotpSecret()         │                         │
       │                             │                             │                         │
       │                             │  3. Create New Backup       │                         │
       │                             │     createBackup(uid, new)  │                         │
       │                             │                             │                         │
       │                             │  4. Update DB               │                         │
       │                             │─────────────────────────────>│                         │
       │                             │     encryptedTotpSecret=new │                         │
       │                             │                             │                         │
       │                             │  5. Update On-Chain         │                         │
       │                             │─────────────────────────────────────────────────────────>
       │                             │     PawPadPolicy.updateCommitments()                  │
       │                             │     (newTotpSecretHash, newBackupBlobHash)            │
       │                             │                             │                         │
       │<────────────────────────────│                             │                         │
       │  {                          │                             │                         │
       │    new_totp: {otpauth_uri}, │                             │                         │
       │    new_backup_file          │                             │                         │
       │  }                          │                             │                         │
       │                             │                             │                         │
```

**Recovery Process**:
1. User uploads saved `backup.json` from cloud storage
2. TEE decrypts to verify ownership
3. New TOTP secret generated and committed on-chain
4. Old credentials are cryptographically invalidated

---

## Security Architecture

### Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ROFL Master Secret                              │
│         (Sealed to SGX/TDX hardware, never extractable)             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ User EVM Keys   │     │ User Sol Keys   │     │ System Keys     │
│ pawpad:user:    │     │ pawpad:user:    │     │ pawpad:master:  │
│ {uid}:evm:v1    │     │ {uid}:sol:v1    │     │ backup:v1       │
│                 │     │                 │     │ jwt:v1          │
│ secp256k1       │     │ ed25519         │     │ signer:v1       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Compromised Server | Keys exist only in TEE memory. Operator cannot extract. |
| Database Breach | TOTP secrets encrypted with TEE-only keys. |
| Man-in-the-Middle | All APIs over HTTPS. JWTs signed with TEE key. |
| Key Substitution | On-chain `PawPadPolicy` binds UID→Address immutably. |
| Lost Device | Encrypted backup + TEE decryption enables secure recovery. |
| Replay Attack | TOTP codes expire every 30s. JWTs expire in 60 minutes. |

---

## Deployment Topology

### Production (ROFL)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Oasis Node (TDX/SGX)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    ROFL Container                         │  │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐   │  │
│  │  │  pawpad-api     │    │  rofl-appd                  │   │  │
│  │  │  (Node.js)      │◄──►│  (Key derivation daemon)    │   │  │
│  │  │  Port 8080      │    │  Unix Socket                │   │  │
│  │  └─────────────────┘    └─────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │                      MongoDB                              │  │
│  │                    (Persistent Volume)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Development (Mock Mode)

```bash
MOCK_ROFL=1 npm run dev
```

In mock mode, `roflKeyGenerate()` returns random ephemeral keys instead of deterministic TEE-derived keys. Suitable for local testing only.
