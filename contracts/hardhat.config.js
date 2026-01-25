require("@nomicfoundation/hardhat-toolbox");
require("@oasisprotocol/sapphire-hardhat");

// Load environment variables
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    // Sapphire Testnet
    "sapphire-testnet": {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff,
      accounts: [PRIVATE_KEY],
    },
    // Sapphire Mainnet
    "sapphire": {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe,
      accounts: [PRIVATE_KEY],
    },
    // Alternative Sapphire Mainnet RPC endpoints
    "sapphire-mainnet": {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe,
      accounts: [PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
};