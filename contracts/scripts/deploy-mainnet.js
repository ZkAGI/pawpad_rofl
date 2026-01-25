// PAWPAD Mainnet Deployment Script
// Deploy PawPadPolicy and PawPadAudit to Oasis Sapphire Mainnet

const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying PAWPAD contracts to Sapphire Mainnet...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ROSE\n");

  // ===========================================
  // CONFIGURATION - UPDATE THESE VALUES
  // ===========================================
  
  // Your ROFL App ID in bytes21 format (for PawPadAudit)
  const ROFL_APP_ID = "0x00a71e9a0068f229815e9c4fac0315dd0db3a19e5e";
  
  // Trusted signer address (for PawPadPolicy)
  // This is the EVM address derived from your ROFL TEE key
  // You need to get this from your ROFL app - it's the address derived from key_id "pawpad-signer"
  const TRUSTED_SIGNER = process.env.TRUSTED_SIGNER || "0x0000000000000000000000000000000000000000";
  
  if (TRUSTED_SIGNER === "0x0000000000000000000000000000000000000000") {
    console.log("⚠️  WARNING: TRUSTED_SIGNER not set!");
    console.log("   You need to get the trusted signer address from your ROFL TEE.");
    console.log("   Set it via: export TRUSTED_SIGNER=0x...\n");
    console.log("   To get it, call your ROFL endpoint: GET /derive-address?key_id=pawpad-signer\n");
    process.exit(1);
  }

  // ===========================================
  // DEPLOY CONTRACTS
  // ===========================================

  // 1. Deploy PawPadPolicy (uses trusted signer address)
  console.log("📦 Deploying PawPadPolicy...");
  console.log("   Trusted Signer:", TRUSTED_SIGNER);
  const PawPadPolicy = await hre.ethers.getContractFactory("PawPadPolicy");
  const pawPadPolicy = await PawPadPolicy.deploy(TRUSTED_SIGNER);
  await pawPadPolicy.waitForDeployment();
  const policyAddress = await pawPadPolicy.getAddress();
  console.log("✅ PawPadPolicy deployed to:", policyAddress);

  // 2. Deploy PawPadAudit (uses ROFL App ID bytes21)
  console.log("\n📦 Deploying PawPadAudit...");
  console.log("   ROFL App ID:", ROFL_APP_ID);
  const PawPadAudit = await hre.ethers.getContractFactory("PawPadAudit");
  const pawPadAudit = await PawPadAudit.deploy(ROFL_APP_ID);
  await pawPadAudit.waitForDeployment();
  const auditAddress = await pawPadAudit.getAddress();
  console.log("✅ PawPadAudit deployed to:", auditAddress);

  // ===========================================
  // DEPLOYMENT SUMMARY
  // ===========================================
  
  console.log("\n" + "=".repeat(60));
  console.log("📋 DEPLOYMENT SUMMARY - SAPPHIRE MAINNET");
  console.log("=".repeat(60));
  console.log("Network:         Oasis Sapphire Mainnet (Chain ID: 23294)");
  console.log("Deployer:        ", deployer.address);
  console.log("-".repeat(60));
  console.log("ROFL App ID:     ", ROFL_APP_ID);
  console.log("Trusted Signer:  ", TRUSTED_SIGNER);
  console.log("-".repeat(60));
  console.log("PawPadPolicy:    ", policyAddress);
  console.log("PawPadAudit:     ", auditAddress);
  console.log("=".repeat(60));

  // Environment variables for your ROFL app
  console.log("\n📝 Add these to your ROFL .env or compose.yaml:");
  console.log("-".repeat(60));
  console.log(`PAWPAD_POLICY_ADDRESS=${policyAddress}`);
  console.log(`PAWPAD_AUDIT_ADDRESS=${auditAddress}`);
  console.log(`ROFL_APP_ID_BYTES21=${ROFL_APP_ID}`);
  console.log("-".repeat(60));

  // Explorer links
  console.log("\n🔍 View on Oasis Explorer:");
  console.log(`   PawPadPolicy: https://explorer.oasis.io/mainnet/sapphire/address/${policyAddress}`);
  console.log(`   PawPadAudit:  https://explorer.oasis.io/mainnet/sapphire/address/${auditAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });