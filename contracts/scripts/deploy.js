const hre = require("hardhat");

async function main() {
  const appId = process.env.ROFL_APP_ID_BYTES21;
  if (!appId) throw new Error("Missing ROFL_APP_ID_BYTES21 in .env");

  // Deploy PawPadPolicy(appId)
  const Policy = await hre.ethers.getContractFactory("PawPadPolicy");
  const policy = await Policy.deploy(appId);
  await policy.waitForDeployment();
  const policyAddr = await policy.getAddress();

  // Deploy PawPadAudit(appId)
  const Audit = await hre.ethers.getContractFactory("PawPadAudit");
  const audit = await Audit.deploy(appId);
  await audit.waitForDeployment();
  const auditAddr = await audit.getAddress();

  console.log("ROFL_APP_ID_BYTES21:", appId);
  console.log("PawPadPolicy:", policyAddr);
  console.log("PawPadAudit: ", auditAddr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
