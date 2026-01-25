# PawPad ROFL - Mainnet Deployment Guide

This guide walks you through deploying PawPad to **production mainnet** on Oasis Sapphire.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Step 1: Fund Deployer Wallet](#step-1-fund-deployer-wallet)
3. [Step 2: Get ROFL Signer Address](#step-2-get-rofl-signer-address)
4. [Step 3: Configure Hardhat for Mainnet](#step-3-configure-hardhat-for-mainnet)
5. [Step 4: Deploy Smart Contracts](#step-4-deploy-smart-contracts)
6. [Step 5: Update Environment Variables](#step-5-update-environment-variables)
7. [Step 6: Build & Deploy ROFL Container](#step-6-build--deploy-rofl-container)
8. [Step 7: Verify Deployment](#step-7-verify-deployment)
9. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

Before starting, ensure you have:

- [ ] **Oasis Sapphire Mainnet ROSE tokens** (~5-10 ROSE for deployments)
- [ ] **MongoDB Atlas** or production MongoDB instance
- [ ] **ROFL App ID** registered on Oasis mainnet
- [ ] **Docker** installed and configured
- [ ] **Node.js 18+** installed

---

## Step 1: Fund Deployer Wallet

You need a wallet with ROSE tokens on Sapphire Mainnet.

### Option A: Use existing wallet
```bash
# Export your private key from MetaMask or other wallet
# Add Sapphire Mainnet to MetaMask:
# - Network Name: Oasis Sapphire
# - RPC URL: https://sapphire.oasis.io
# - Chain ID: 23294
# - Currency: ROSE
```

### Option B: Create new deployer wallet
```bash
# Generate a new wallet (save the private key securely!)
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"
```

### Fund the wallet
Send at least **5 ROSE** to your deployer address on Sapphire Mainnet.

---

## Step 2: Get ROFL Signer Address

The ROFL TEE derives a deterministic signer address. You need this for contract deployment.

### If you have a running ROFL instance:
```bash
curl http://localhost:8080/v1/rofl/status
# Returns: { sapphireSigner: "0x764...." }
```

### Or run temporarily in mock mode to get the address:
```bash
cd api
MOCK_ROFL=1 npm run dev
# Then call /v1/rofl/status to get the signer address
```

> **Important**: Save this address! You'll need it for contract deployment.

---

## Step 3: Configure Hardhat for Mainnet

### 3.1 Add Sapphire Mainnet to Hardhat config

Edit `contracts/hardhat.config.js`:

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    // Testnet (existing)
    sapphire_testnet: {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 23295,
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
    // Mainnet (NEW)
    sapphire_mainnet: {
      url: "https://sapphire.oasis.io",
      chainId: 23294,
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
  },
};
```

### 3.2 Create `.env` file in contracts folder

```bash
cd contracts
touch .env
```

Add to `contracts/.env`:
```env
# Deployer private key (WITH 0x prefix)
DEPLOYER_PK=0xYOUR_PRIVATE_KEY_HERE

# ROFL App ID (keep same as testnet or register new for mainnet)
ROFL_APP_ID_BYTES21=0x0014...
```

---

## Step 4: Deploy Smart Contracts

### 4.1 Update deploy script with mainnet signer

Edit `contracts/scripts/deploy.js` if needed to update the `TRUSTED_SIGNER` address:

```javascript
const TRUSTED_SIGNER = "0x764a...."; // Your ROFL signer
```

### 4.2 Deploy to Sapphire Mainnet

```bash
cd contracts

# Install dependencies (if not already done)
npm install

# Deploy to MAINNET
npx hardhat run scripts/deploy.js --network sapphire_mainnet
```

### Expected output:
```
TRUSTED_SIGNER:    0x76....
PawPadPolicy:      0x1234...abcd  <- SAVE THIS
PawPadAudit:       0x5678...efgh  <- SAVE THIS
```

> **⚠️ CRITICAL**: Save both contract addresses! You need them for the next step.

---

## Step 5: Update Environment Variables

### 5.1 Update `compose.yaml` for mainnet

```yaml
services:
  api:
    image: docker.io/zkagi/pawpad-rofl-api:0.1.0
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - MOCK_ROFL=0
      
      # MongoDB (use Atlas for production)
      - MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/pawpad_rofl
      
      # ROFL
      - ROFL_APPD_SOCKET=/run/rofl-appd.sock
      - ROFL_APP_ID_BYTES21=0x00...
      
      # Sapphire MAINNET
      - SAPPHIRE_RPC_URL=https://sapphire.oasis.io
      - SAPPHIRE_CHAIN_ID=23294
      
      # NEW: Deployed contract addresses from Step 4
      - POLICY_CONTRACT=0x_YOUR_NEW_POLICY_ADDRESS
      - AUDIT_CONTRACT=0x_YOUR_NEW_AUDIT_ADDRESS
      
      # Trading chains (optional - can use env vars or defaults)
      - ETHEREUM_RPC_URL=https://ethereum-rpc.publicnode.com
      - BASE_RPC_URL=https://mainnet.base.org
      - SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
      
    volumes:
      - /run/rofl-appd.sock:/run/rofl-appd.sock
```

### 5.2 Summary of changes

| Variable | Testnet Value | Mainnet Value |
|----------|---------------|---------------|
| `SAPPHIRE_RPC_URL` | `https://testnet.sapphire.oasis.io` | `https://sapphire.oasis.io` |
| `SAPPHIRE_CHAIN_ID` | `23295` | `23294` |
| `POLICY_CONTRACT` | `0x418...` | **Your new address** |
| `AUDIT_CONTRACT` | `0xE2...` | **Your new address** |
| `MONGO_URI` | Local/test | Production MongoDB Atlas |

---

## Step 6: Build & Deploy ROFL Container

### 6.1 Build Docker image

```bash
cd api

# Build the Docker image
docker build -t zkagi/pawpad-rofl-api:mainnet .
```

### 6.2 Push to registry (if using remote)

```bash
docker push zkagi/pawpad-rofl-api:mainnet
```

### 6.3 Deploy with Docker Compose

```bash
cd ..  # Back to project root

# Update image tag in compose.yaml to :mainnet
# Then start:
docker-compose up -d
```

### 6.4 Or deploy to ROFL infrastructure

If deploying to Oasis ROFL infrastructure:

```bash
# Build ROFL app
oasis rofl build

# Register/update app
oasis rofl update <app-id>

# Deploy
oasis rofl deploy
```

---

## Step 7: Verify Deployment

### 7.1 Health check

```bash
curl http://localhost:8080/health
# Expected: { "ok": true }
```

### 7.2 ROFL status check

```bash
curl http://localhost:8080/v1/rofl/status
```

Expected response:
```json
{
  "ok": true,
  "mock": false,
  "sapphireSigner": "0x764...",
  "sapphireSignerBalance": "5.0",
  "sapphireChainId": 23294,
  "policyContract": "0xYOUR_POLICY_ADDRESS"
}
```

### 7.3 Test user registration

```bash
curl -X POST http://localhost:8080/v1/connect \
  -H "Content-Type: application/json"
```

### 7.4 Verify on-chain registration

Check the transaction on Oasis Sapphire Explorer:
- Mainnet: https://explorer.oasis.io/mainnet/sapphire

---

## Troubleshooting

### Error: "Transaction failed"
- Ensure the ROFL signer has ROSE tokens on Sapphire mainnet
- Check: `curl http://localhost:8080/v1/rofl/status` (look at `sapphireSignerBalance`)

### Error: "Insufficient funds"
- Fund the ROFL signer address with ROSE tokens
- You can find the signer address in `/v1/rofl/status` response

### Error: "Contract not found"
- Verify `POLICY_CONTRACT` and `AUDIT_CONTRACT` are set correctly
- Ensure contracts were deployed to mainnet (chainId 23294, not 23295)

### Error: MongoDB connection failed
- Verify `MONGO_URI` is correct and reachable
- For Atlas: whitelist your server's IP address

### ROFL signer different from expected
- The signer is deterministic based on ROFL App ID and key derivation path
- If App ID changed, the signer will be different
- Redeploy contracts with the new signer address

---

## Quick Reference

### Mainnet Configuration Summary

```env
# Sapphire Mainnet
SAPPHIRE_RPC_URL=https://sapphire.oasis.io
SAPPHIRE_CHAIN_ID=23294

# Update these with your deployed addresses
POLICY_CONTRACT=0x_YOUR_MAINNET_POLICY_ADDRESS
AUDIT_CONTRACT=0x_YOUR_MAINNET_AUDIT_ADDRESS

# Trading chains
ETHEREUM_RPC_URL=https://ethereum-rpc.publicnode.com
BASE_RPC_URL=https://mainnet.base.org
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### Useful Links

- Sapphire Mainnet Explorer: https://explorer.oasis.io/mainnet/sapphire
- Sapphire RPC: https://sapphire.oasis.io
- Oasis ROFL Docs: https://docs.oasis.io/rofl

---

## Checklist

- [ ] Deployer wallet funded with ROSE
- [ ] Hardhat configured for mainnet
- [ ] Smart contracts deployed to Sapphire mainnet
- [ ] Contract addresses saved
- [ ] compose.yaml updated with mainnet config
- [ ] MongoDB production instance configured
- [ ] Docker image built and deployed
- [ ] Health check passing
- [ ] ROFL signer has ROSE balance
- [ ] Test registration works
