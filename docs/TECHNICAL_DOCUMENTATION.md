# PawPad ROFL - Technical Documentation

## 1. System Overview

**PawPad ROFL** is a privacy-preserving application built on the **Oasis Sapphire** network. It leverages **ROFL (Runtime Off-Chain Logic)** to run sensitive backend logic inside a Trusted Execution Environment (TEE). This allows the application to manage user private keys (for EVM and Solana wallets) securely without them ever leaving the secure enclave, while still enabling complex off-chain automation.

### Core Architecture
- **ROFL Container (TEE)**: The backend runs inside an SGX/TDX enclave. It is the only entity that can access the root secrets used to derive user wallets.
- **Key Management**: Keys are derived deterministically from a master secret + user ID (`uid`). This allows for non-custodial-like security properties where the operator cannot see user keys, but the TEE can allow automation.
- **Smart Contract**: `PawPadPolicy.sol` on Sapphire acts as the on-chain "registry" of user identities and security commitments (e.g., hash of TOTP secret, backup hash).
- **Frontend**: Connects to the ROFL API to creates accounts, get wallet addresses, and initiate actions.

---

## 2. Current Implementation

### 2.1 Registration Flow
The registration process is designed to be seamless while establishing strong security commitments immediately.

**Endpoint:** `POST /v1/connect`

**Workflow:**
1.  **UID Generation**: The backend generates a random 16-byte `uid`.
2.  **TOTP Setup**: A random TOTP secret is generated. This serves as the primary authentication factor.
3.  **Wallet Derivation**:
    -   **EVM (Base/Sapphire)**: Key derived from `pawpad:user:{uid}:evm:v1`.
    -   **Solana**: Key derived from `pawpad:user:{uid}:sol:v1`.
    -   *Note*: These keys are derived on the fly and never stored on disk in plaintext.
4.  **Backup Creation**:
    -   A JSON blob containing the UID and TOTP secret is created.
    -   Encrypted with a backup master key derived inside ROFL.
    -   Returned to the user to save (crucial for recovery).
5.  **Sapphire Registration (On-Chain)**:
    -   The ROFL instance signs a transaction using its system-wide `trustedSigner` key.
    -   Calls `PawPadPolicy.registerUser(...)` with:
        -   `uidHash`: `keccak256(uid)`
        -   `evmAddress`: The user's derived EVM address.
        -   `solanaPubkey`: The user's derived Solana Pubkey.
        -   `totpSecretHash`: Commitment to the Auth secret.
        -   `backupBlobHash`: Commitment to the backup file integrity.

**Response:** Returns `uid`, `wallets` (public addresses), `totp` (OTP URL for QR codes), and the encrypted `backup_file`.

### 2.2 Authentication
**Endpoint:** `POST /v1/login`

-   Requires `uid` and a current `totp_code`.
-   The backend verifies the code against the derived secret.
-   Issues a **Bearer Session Token** for subsequent requests.
-   *Security Note*: Currently, the client must send the `totp_secret` back during login (stateless prototype). In production, this secret will be persisted in the ROFL's encrypted storage (`rofl.yaml` storage config) so the user only needs the code.

### 2.3 Smart Contracts (`PawPadPolicy.sol`)
Located in `contracts/contracts/PawPadPolicy.sol`.

**Role:** Acts as the "Source of Truth" and "Governance" for user accounts.
-   **Trusted Signer**: The contract only accepts updates from the hardcoded `trustedSigner` address (which corresponds to the ROFL instance).
-   **Commitments**: verification hashes are stored on-chain, preventing the backend from maliciously swapping user keys without detection.
-   **Account Freeze**: Allows emergency freezing of accounts during compromise.
-   **Recovery Logic**: Enforces timelocks on recovery to prevent instant account takeovers.

---

## 3. Future Architecture: Automated AI Trading Agent

The goal is to integrate an **AI Trading Agent** that automatically executes trades (Buy/Hodl/Sell) on behalf of the user based on incoming signals.

### 3.1 User Workflow
1.  **Funding**: The user funds their specific PawPad USDC wallet (EVM or Solana).
    -   *Address*: Visible in `/v1/wallets`.
2.  **Authorization**: The user toggles "Enable AI Trading" in the UI.
    -   This sets a flag in the user's ROFL profile (and potentially on-chain via `PawPadPolicy` flags).
    -   User specifies risk parameters (e.g., "Max 100 USDC per trade").
3.  **Signal Reception**:
    -   An external Signal Provider (or internal AI service) sends a signal: `{ "pair": "ETH/USDC", "action": "BUY", "confidence": 0.9 }`.
4.  **Execution**:
    -   The ROFL backend receives the signal.
    -   Validates the signal against user settings (balance checks, risk limits).
    -   **Sign & Send**: The ROFL backend derives the user's private key *internally*, signs the transaction (e.g., Uniswap Swap), and broadcasts it.

### 3.2 Required Components

#### A. Signal Endpoint
New logic in `api/src/routes.ts` or a new `agent.ts`.

```typescript
// Proposed Endpoint
POST /v1/agent/signal
Header: Admin-Key (or internal verification)
Body: {
  strategy_id: "momentum_alpha",
  token_in: "USDC",
  token_out: "WETH",
  amount_percent: 10, // Invest 10% of available USDC
  chain: "base"
}
```

#### B. Execution Module (`api/src/trade.ts`)
A new module to handle chain interaction.
-   **DEX Integration**: Logic to construct swap calldata for Uniswap/Aerodrome (Base) or Raydium (Solana).
-   **Gas Management**: Ensure the user has ETH/SOL for gas, or implement a "Gas Relayer" where the service pays gas and deducts USDC.

#### C. Smart Contracts (Optional but Recommended)
While the ROFL backend *can* sign standard swaps directly, a **Vault/Proxy Contract** adds safety:
-   **PawPadVault.sol**: Users deposit USDC here instead of their EOA.
    -   `deposit(token, amount)`
    -   `executeTrade(tokenIn, tokenOut, amount, minReturn)`: Only callable by the `trustedSigner` (ROFL).
    -   *Benefit*: Simpler gas management (vault can pay gas), better accounting, and user funds are pooled or segregated but managed more explicitly.
    -   *Current Decision*: Sticking to **EOA (Externally Owned Account)** trading is simpler for MVP. The ROFL just signs standard transaction data.

### 3.3 Endpoints: Current vs Future Needs

| Flow | Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/v1/connect` | Create account & keys | ✅ Active |
| **Auth** | `POST` | `/v1/login` | Get session token | ✅ Active |
| **Wallet** | `GET` | `/v1/wallets` | Get addresses | ✅ Active |
| **Info** | `GET` | `/v1/rofl/status` | Check TEE health | ✅ Active |
| **Recov** | `POST` | `/v1/recovery/decrypt` | Restore from backup | ✅ Active |
| **Trade** | `POST` | `/v1/trade/settings` | **(NEW)** User sets risk/allowance | 🚧 Future |
| **Trade** | `POST` | `/v1/agent/signal` | **(NEW)** Ingest AI signals | 🚧 Future |
| **Trade** | `GET` | `/v1/trade/history` | **(NEW)** View AI performance | 🚧 Future |

---

## 4. Wallet Recovery & Security

Recovery is critical because if the user loses their TOTP secret, they cannot access the keys derived inside the TEE.

### 4.1 Current Recovery Mechanism
1.  **Backup File**: During registration, the user gets a `backup.json` (encrypted).
2.  **Restoration**:
    -   User uploads `backup.json` to `/v1/recovery/decrypt`.
    -   ROFL decrypts it using the `pawpad:master:backup:v1` key.
    -   Extracts the `uid`.
    -   *Missing Step*: Currently, it just returns the payload. In a full flow, it should allow resetting the TOTP secret.

### 4.2 Enhanced Recovery (Production)
The `PawPadPolicy.sol` contract already supports a robust flow:
1.  **Initiate Recovery**: User calls `startRecovery` on-chain (requires passing a check, or perhaps a "Social Guardian" triggers it, or via a separate auth flow).
    -   **Effect**: Account is `frozen`. No trades (including AI trades) can happen.
2.  **Timelock**: A built-in wait period (e.g., 24 hours) allows the original owner to cancel if it's an attack.
3.  **Completion**: After the timelock, `completeRecovery` is called.
    -   The ROFL backend rotates the TOTP secret.
    -   The user receives a new QR code.
    -   Account is unfrozen.

### 4.3 AI Agent Security Guidelines
1.  **Scope Constraints**: The AI Agent should *only* be allowed to:
    -   Trade specifically whitelisted pairs (e.g., "Only Top 20 tokens").
    -   Never withdraw to external addresses (Only Swap).
2.  **Emergency Stop**: The `/v1/trade/settings` endpoint must have a "Kill Switch" that instantly stops the AI agent for that user.
3.  **Slippage Protection**: The Execution Module must enforce strict slippage limits (e.g., 1%) to prevent the AI from getting sandwich-attacked.

---

## 5. Development Roadmap

1.  **Phase 1 (Current)**:
    -   Secure Registration & Key Derivation (Done).
    -   On-chain Identity Registry (Done).
    -   Basic Wallet Viewing (Done).

2.  **Phase 2 (Trading Infrastructure)**:
    -   Add `ethers.js` / `web3.js` logic to `api/src` to transact on Base/Sapphire.
    -   Implement "Gas Management" (User sends ETH to their derived address).

3.  **Phase 3 (AI Integration)**:
    -   Build the **Signal Listener** service.
    -   Connect it to the internal `roflKeyGenerate` to sign transactions.
    -   Deploy "Auto-Trade" toggles in the UI.

4.  **Phase 4 (Hardening)**:
    -   Implement the full Recovery flow (connect `PawPadPolicy` recovery events to backend logic).
    -   Audits for the TEE application logic.
