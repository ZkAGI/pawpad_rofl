# PawPad ROFL

**Non-Custodial AI Trading Wallet powered by Oasis ROFL (Trusted Execution Environment)**

PawPad is a privacy-preserving mobile wallet that enables automated AI-driven trading without users ever exposing their private keys. The system leverages Oasis Network's ROFL (Runtime Off-Chain Logic) to run sensitive cryptographic operations inside a secure hardware enclave (TEE).

---

## Features

- **Seedless Onboarding**: No 12-word seed phrases. Users authenticate via TOTP (Google Authenticator).
- **Non-Custodial Security**: Private keys are derived and used exclusively inside the TEE. The operator has zero access.
- **Automated Trading**: AI signals trigger trades on Base (EVM) and Solana networks every 4 hours.
- **On-Chain Identity Registry**: User credentials are committed to Oasis Sapphire, preventing key substitution attacks.
- **Secure Recovery**: Lost device? Upload your encrypted backup file to rotate credentials without exposing keys.

---

## Architecture Overview

```
┌─────────────────┐       ┌──────────────────────────┐       ┌─────────────────┐
│   Mobile App    │◄─────►│   ROFL TEE Backend       │◄─────►│   Blockchains   │
│   (Frontend)    │       │   (Node.js + Express)    │       │   (Base/Solana) │
└─────────────────┘       └──────────────────────────┘       └─────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │   MongoDB            │
                          │   (User Configs)     │
                          └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │   Oasis Sapphire     │
                          │   (Identity Registry)│
                          └──────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed flow diagrams.

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Access to Oasis Sapphire Testnet (for contract deployment)

### 1. Clone & Install

```bash
git clone https://github.com/ZkAGI/pawpad_rofl.git
cd pawpad_rofl/api
npm install
```

### 2. Environment Configuration

Create a `.env` file in the `api/` directory:

```env
PORT=8080
MOCK_ROFL=0
MONGO_URI=mongodb://localhost:27017/pawpad_rofl
BASE_RPC_URL=https://mainnet.base.org

# Sapphire (Oasis)
SAPPHIRE_RPC_URL=https://testnet.sapphire.oasis.io
SAPPHIRE_CHAIN_ID=23295
POLICY_CONTRACT=0x...
AUDIT_CONTRACT=0x...
```

### 3. Run with Docker Compose

```bash
docker-compose up -d
```

This starts:
- **API Service** (port 8080)
- **MongoDB** (port 27017)

### 4. Deploy Smart Contracts

```bash
cd contracts
npm install
npx hardhat run scripts/deploy.ts --network sapphire-testnet
```

Update `.env` with the deployed contract addresses.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/v1/rofl/status` | TEE runtime status |
| `POST` | `/v1/connect` | Create new wallet (registration) |
| `POST` | `/v1/login` | Authenticate with TOTP code |
| `GET` | `/v1/wallets` | Get wallet addresses (requires auth) |
| `POST` | `/v1/wallets/withdraw` | Withdraw funds to external address |
| `POST` | `/v1/trade/config` | Configure trading parameters |
| `GET` | `/v1/trade/history` | View executed trades |
| `POST` | `/v1/recovery/rotate` | Recover account with backup file |

---


## Smart Contracts

### PawPadPolicy.sol
Deployed on **Oasis Sapphire**. Stores user identity commitments:
- UID Hash → EVM Address mapping
- UID Hash → Solana Pubkey mapping
- TOTP secret hash (for verification)
- Backup blob hash (for integrity)

Only the TEE-derived signer (`trustedSigner`) can modify user records.

### PawPadAudit.sol
On-chain audit trail. Each trade execution is logged with:
- User ID hash
- Action type (BUY/SELL)
- Transaction hash
- Metadata (price, amount)

---

## Security Model

| Layer | Protection |
|-------|------------|
| **Key Derivation** | Private keys derived inside SGX/TDX TEE using ROFL KMS. Never written to disk. |
| **Authentication** | TOTP (RFC 6238) stored encrypted in MongoDB using TEE-derived encryption key. |
| **On-Chain Commitments** | Sapphire contract locks user↔wallet binding, preventing server-side tampering. |
| **Trading Execution** | Keys derived on-demand, transactions signed in-memory, immediately discarded. |
| **Recovery** | AES-256-GCM encrypted backup. Decryption requires TEE master key. |

---

## Development

### Local Testing (Mock Mode)

For development without ROFL hardware:

```bash
MOCK_ROFL=1 npm run dev
```

This uses random ephemeral keys instead of TEE-derived deterministic keys.

### Running Tests

```bash
npm test
```

---

## Project Structure

```
pawpad_rofl/
├── api/                    # Backend API (Node.js/Express)
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── routes.ts       # API routes
│   │   ├── trading.ts      # Automated trading logic
│   │   ├── keys.ts         # Key derivation
│   │   ├── crypto.ts       # Encryption utilities
│   │   ├── auth.ts         # TOTP & JWT
│   │   ├── sapphire.ts     # On-chain interactions
│   │   ├── rofl.ts         # ROFL daemon communication
│   │   └── database.ts     # MongoDB schemas
│   └── package.json
├── contracts/              # Solidity contracts
│   └── contracts/
│       ├── PawPadPolicy.sol
│       └── PawPadAudit.sol
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md
│   └── TECHNICAL_DOCUMENTATION.md
├── compose.yaml            # Docker Compose
└── rofl.yaml               # ROFL app manifest
```

---

## License

Apache-2.0

---

## Contributing

Contributions are welcome. Please open an issue first to discuss proposed changes.
