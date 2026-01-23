// import { encodeFunctionData, keccak256, toHex } from "viem";
// import { PublicKey } from "@solana/web3.js";
// import { roflTxSignSubmit } from "./rofl.js";
// import { CFG } from "./config.js";

// export function totpHash(secret: string): `0x${string}` {
//   return keccak256(toHex(secret));
// }

// export function uidHash(uid: string): `0x${string}` {
//   return keccak256(toHex(uid));
// }

// /**
//  * Convert base58 Solana pubkey to bytes32 hex (0x + 64 hex chars)
//  */
// export function solanaPubkeyToBytes32(solanaAddressBase58: string): `0x${string}` {
//   const pk = new PublicKey(solanaAddressBase58);
//   const bytes = pk.toBytes(); // Uint8Array(32)
//   const hex = Buffer.from(bytes).toString("hex");
//   return (`0x${hex}`) as `0x${string}`;
// }

// // ✅ Contract signature matches PawPadPolicy.sol exactly
// const PolicyAbi = [
//   {
//     type: "function",
//     name: "registerUser",
//     stateMutability: "nonpayable",
//     inputs: [
//       { name: "uidHash", type: "bytes32" },
//       { name: "evmAddress", type: "address" },
//       { name: "solanaPubkey", type: "bytes32" },
//       { name: "totpSecretHash", type: "bytes32" },
//       { name: "backupBlobHash", type: "bytes32" },
//     ],
//     outputs: [],
//   },
// ] as const;

// export async function registerUserOnSapphire(args: {
//   uid: string;
//   evmAddress: `0x${string}`;
//   solanaAddressBase58: string;
//   totpSecret: string;
//   backupHash: `0x${string}`;
// }): Promise<{ ok: true; tx: any; calldata: `0x${string}` }> {
//   if (!CFG.policyContract) throw new Error("POLICY_CONTRACT missing");
//   if (CFG.mockRofl) return { ok: true, tx: { mocked: true }, calldata: "0x" as `0x${string}` };

//   const calldata = encodeFunctionData({
//     abi: PolicyAbi,
//     functionName: "registerUser",
//     args: [
//       uidHash(args.uid),
//       args.evmAddress,
//       solanaPubkeyToBytes32(args.solanaAddressBase58),
//       totpHash(args.totpSecret),
//       args.backupHash,
//     ],
//   });

//   // ✅ EXACT shape from ROFL doc
//   const payload = {
//     encrypt: true,
//     tx: {
//       kind: "eth",
//       data: {
//         gas_limit: 350000,              // slightly higher for safety
//         to: CFG.policyContract,
//         value: "0",
//         data: calldata,
//       },
//     },
//   };

//   const tx = await roflTxSignSubmit(payload);
//   return { ok: true, tx, calldata };
// }

// import { encodeFunctionData, keccak256, toHex } from "viem";
// import { PublicKey } from "@solana/web3.js";
// import { Wallet, JsonRpcProvider } from "ethers";
// import { roflKeyGenerate } from "./rofl.js";
// import { CFG } from "./config.js";

// export function totpHash(secret: string): `0x${string}` {
//   return keccak256(toHex(secret));
// }

// export function uidHash(uid: string): `0x${string}` {
//   return keccak256(toHex(uid));
// }

// /**
//  * Convert base58 Solana pubkey to bytes32 hex (0x + 64 hex chars)
//  */
// export function solanaPubkeyToBytes32(solanaAddressBase58: string): `0x${string}` {
//   const pk = new PublicKey(solanaAddressBase58);
//   const bytes = pk.toBytes(); // Uint8Array(32)
//   const hex = Buffer.from(bytes).toString("hex");
//   return `0x${hex}` as `0x${string}`;
// }

// // ✅ Contract signature matches PawPadPolicy.sol exactly
// const PolicyAbi = [
//   {
//     type: "function",
//     name: "registerUser",
//     stateMutability: "nonpayable",
//     inputs: [
//       { name: "uidHash", type: "bytes32" },
//       { name: "evmAddress", type: "address" },
//       { name: "solanaPubkey", type: "bytes32" },
//       { name: "totpSecretHash", type: "bytes32" },
//       { name: "backupBlobHash", type: "bytes32" },
//     ],
//     outputs: [],
//   },
//   {
//     type: "function",
//     name: "getUser",
//     stateMutability: "view",
//     inputs: [{ name: "uidHash", type: "bytes32" }],
//     outputs: [
//       {
//         type: "tuple",
//         components: [
//           { name: "evmAddress", type: "address" },
//           { name: "solanaPubkey", type: "bytes32" },
//           { name: "totpSecretHash", type: "bytes32" },
//           { name: "backupBlobHash", type: "bytes32" },
//           { name: "recoveryPendingUntil", type: "uint64" },
//           { name: "frozen", type: "bool" },
//           { name: "flags", type: "uint32" },
//         ],
//       },
//     ],
//   },
// ] as const;

// // Key ID for the ROFL signer - deterministically derives the same key each time
// const ROFL_SIGNER_KEY_ID = "pawpad:sapphire:signer:v1";

// // Cache the wallet to avoid regenerating on every call
// let cachedWallet: Wallet | null = null;
// let cachedWalletAddress: string | null = null;

// /**
//  * Get the ROFL signer wallet connected to Sapphire.
//  * The key is derived deterministically inside ROFL TEE.
//  */
// async function getRoflSignerWallet(): Promise<Wallet> {
//   if (cachedWallet) {
//     return cachedWallet;
//   }

//   // Generate (or re-derive) the ROFL app's signing key
//   // This is deterministic - same key_id always returns same key
//   const secretKeyHex = await roflKeyGenerate(ROFL_SIGNER_KEY_ID, "secp256k1");

//   // Sapphire Testnet RPC and chain ID
//   const sapphireRpcUrl = CFG.sapphireRpcUrl || "https://testnet.sapphire.oasis.io";
//   const chainId = CFG.sapphireChainId || 23295; // Sapphire Testnet

//   const provider = new JsonRpcProvider(sapphireRpcUrl, chainId);
//   cachedWallet = new Wallet(secretKeyHex, provider);
//   cachedWalletAddress = await cachedWallet.getAddress();

//   console.log(`ROFL Sapphire signer initialized: ${cachedWalletAddress}`);

//   return cachedWallet;
// }

// /**
//  * Get the ROFL signer's address (useful for checking balance, etc.)
//  */
// export async function getRoflSignerAddress(): Promise<string> {
//   if (cachedWalletAddress) {
//     return cachedWalletAddress;
//   }
//   const wallet = await getRoflSignerWallet();
//   return wallet.address;
// }

// /**
//  * Check ROFL signer's ROSE balance on Sapphire
//  */
// export async function getRoflSignerBalance(): Promise<string> {
//   const wallet = await getRoflSignerWallet();
//   const balance = await wallet.provider!.getBalance(wallet.address);
//   return balance.toString();
// }

// export async function registerUserOnSapphire(args: {
//   uid: string;
//   evmAddress: `0x${string}`;
//   solanaAddressBase58: string;
//   totpSecret: string;
//   backupHash: `0x${string}`;
// }): Promise<{ ok: true; tx: any; calldata: `0x${string}`; signerAddress: string }> {
//   if (!CFG.policyContract) {
//     throw new Error("POLICY_CONTRACT missing in config");
//   }

//   if (CFG.mockRofl) {
//     console.log("MOCK_ROFL=1, skipping Sapphire transaction");
//     return {
//       ok: true,
//       tx: { mocked: true },
//       calldata: "0x" as `0x${string}`,
//       signerAddress: "0x0000000000000000000000000000000000000000",
//     };
//   }

//   const calldata = encodeFunctionData({
//     abi: PolicyAbi,
//     functionName: "registerUser",
//     args: [
//       uidHash(args.uid),
//       args.evmAddress,
//       solanaPubkeyToBytes32(args.solanaAddressBase58),
//       totpHash(args.totpSecret),
//       args.backupHash,
//     ],
//   });

//   // Get the ROFL signer wallet (key derived inside TEE)
//   const wallet = await getRoflSignerWallet();

//   console.log(`Sending registerUser tx from ROFL signer: ${wallet.address}`);
//   console.log(`  -> Policy contract: ${CFG.policyContract}`);
//   console.log(`  -> uidHash: ${uidHash(args.uid)}`);
//   console.log(`  -> evmAddress: ${args.evmAddress}`);

//   try {
//     // Check balance first
//     const balance = await wallet.provider!.getBalance(wallet.address);
//     console.log(`ROFL signer balance: ${balance.toString()} wei`);

//     if (balance === 0n) {
//       throw new Error(
//         `ROFL signer ${wallet.address} has no ROSE balance on Sapphire Testnet. ` +
//           `Please fund this address with TEST ROSE from https://faucet.testnet.oasis.io/`
//       );
//     }

//     // Send the transaction
//     const tx = await wallet.sendTransaction({
//       to: CFG.policyContract,
//       data: calldata,
//       gasLimit: 500000, // Higher limit for safety with Sapphire
//     });

//     console.log(`Transaction sent: ${tx.hash}`);

//     // Wait for confirmation
//     const receipt = await tx.wait();
//     console.log(`Transaction confirmed in block: ${receipt?.blockNumber}`);

//     if (receipt?.status === 0) {
//       throw new Error(`Transaction reverted: ${tx.hash}`);
//     }

//     return {
//       ok: true,
//       tx: {
//         hash: receipt?.hash,
//         blockNumber: receipt?.blockNumber,
//         status: receipt?.status,
//       },
//       calldata,
//       signerAddress: wallet.address,
//     };
//   } catch (error: any) {
//     // Provide more helpful error messages
//     if (error.code === "INSUFFICIENT_FUNDS") {
//       throw new Error(
//         `ROFL signer ${wallet.address} has insufficient ROSE for gas. ` +
//           `Fund it at https://faucet.testnet.oasis.io/`
//       );
//     }
//     if (error.message?.includes("already registered")) {
//       console.warn(`User already registered on Sapphire (uid: ${args.uid})`);
//       return {
//         ok: true,
//         tx: { alreadyRegistered: true },
//         calldata,
//         signerAddress: wallet.address,
//       };
//     }
//     throw error;
//   }
// }

// import { encodeFunctionData, keccak256, toHex } from "viem";
// import { PublicKey } from "@solana/web3.js";
// import { Wallet, JsonRpcProvider } from "ethers";
// import { roflKeyGenerate } from "./rofl.js";
// import { CFG } from "./config.js";

// export function totpHash(secret: string): `0x${string}` {
//   return keccak256(toHex(secret));
// }

// export function uidHash(uid: string): `0x${string}` {
//   return keccak256(toHex(uid));
// }

// /**
//  * Convert base58 Solana pubkey to bytes32 hex (0x + 64 hex chars)
//  */
// export function solanaPubkeyToBytes32(solanaAddressBase58: string): `0x${string}` {
//   const pk = new PublicKey(solanaAddressBase58);
//   const bytes = pk.toBytes(); // Uint8Array(32)
//   const hex = Buffer.from(bytes).toString("hex");
//   return `0x${hex}` as `0x${string}`;
// }

// // ✅ Contract signature matches PawPadPolicy.sol exactly
// const PolicyAbi = [
//   {
//     type: "function",
//     name: "registerUser",
//     stateMutability: "nonpayable",
//     inputs: [
//       { name: "uidHash", type: "bytes32" },
//       { name: "evmAddress", type: "address" },
//       { name: "solanaPubkey", type: "bytes32" },
//       { name: "totpSecretHash", type: "bytes32" },
//       { name: "backupBlobHash", type: "bytes32" },
//     ],
//     outputs: [],
//   },
//   {
//     type: "function",
//     name: "getUser",
//     stateMutability: "view",
//     inputs: [{ name: "uidHash", type: "bytes32" }],
//     outputs: [
//       {
//         type: "tuple",
//         components: [
//           { name: "evmAddress", type: "address" },
//           { name: "solanaPubkey", type: "bytes32" },
//           { name: "totpSecretHash", type: "bytes32" },
//           { name: "backupBlobHash", type: "bytes32" },
//           { name: "recoveryPendingUntil", type: "uint64" },
//           { name: "frozen", type: "bool" },
//           { name: "flags", type: "uint32" },
//         ],
//       },
//     ],
//   },
// ] as const;

// // Key ID for the ROFL signer - deterministically derives the same key each time
// const ROFL_SIGNER_KEY_ID = "pawpad:sapphire:signer:v1";

// // Cache the wallet to avoid regenerating on every call
// let cachedWallet: Wallet | null = null;
// let cachedWalletAddress: string | null = null;

// /**
//  * Normalize a hex key to the format ethers.js expects:
//  * - Must be 0x-prefixed
//  * - Must be exactly 64 hex characters (32 bytes) after the prefix
//  */
// function normalizePrivateKey(key: string): string {
//   // Remove 0x prefix if present for processing
//   let hex = key.startsWith("0x") ? key.slice(2) : key;

//   // Remove any whitespace or newlines
//   hex = hex.trim().replace(/\s/g, "");

//   // Validate it's hex
//   if (!/^[0-9a-fA-F]+$/.test(hex)) {
//     throw new Error(`Invalid private key: not valid hex. Length: ${key.length}, preview: ${key.substring(0, 20)}...`);
//   }

//   // secp256k1 private key should be 32 bytes = 64 hex chars
//   if (hex.length !== 64) {
//     throw new Error(`Invalid private key length: expected 64 hex chars, got ${hex.length}`);
//   }

//   return `0x${hex}`;
// }

// /**
//  * Get the ROFL signer wallet connected to Sapphire.
//  * The key is derived deterministically inside ROFL TEE.
//  */
// async function getRoflSignerWallet(): Promise<Wallet> {
//   if (cachedWallet) {
//     return cachedWallet;
//   }

//   // Generate (or re-derive) the ROFL app's signing key
//   // This is deterministic - same key_id always returns same key
//   console.log(`Generating ROFL key with key_id: ${ROFL_SIGNER_KEY_ID}`);
//   const rawKey = await roflKeyGenerate(ROFL_SIGNER_KEY_ID, "secp256k1");

//   // Debug: log key format (not the actual key value!)
//   console.log(`Raw key received - type: ${typeof rawKey}, length: ${rawKey?.length}`);

//   // Normalize the key for ethers.js
//   const secretKeyHex = normalizePrivateKey(rawKey);

//   // Sapphire Testnet RPC and chain ID
//   const sapphireRpcUrl = CFG.sapphireRpcUrl || "https://testnet.sapphire.oasis.io";
//   const chainId = CFG.sapphireChainId || 23295; // Sapphire Testnet

//   const provider = new JsonRpcProvider(sapphireRpcUrl, chainId);
//   cachedWallet = new Wallet(secretKeyHex, provider);
//   cachedWalletAddress = await cachedWallet.getAddress();

//   console.log(`ROFL Sapphire signer initialized: ${cachedWalletAddress}`);

//   return cachedWallet;
// }

// /**
//  * Get the ROFL signer's address (useful for checking balance, etc.)
//  */
// export async function getRoflSignerAddress(): Promise<string> {
//   if (cachedWalletAddress) {
//     return cachedWalletAddress;
//   }
//   const wallet = await getRoflSignerWallet();
//   return wallet.address;
// }

// /**
//  * Check ROFL signer's ROSE balance on Sapphire
//  */
// export async function getRoflSignerBalance(): Promise<string> {
//   const wallet = await getRoflSignerWallet();
//   const balance = await wallet.provider!.getBalance(wallet.address);
//   return balance.toString();
// }

// export async function registerUserOnSapphire(args: {
//   uid: string;
//   evmAddress: `0x${string}`;
//   solanaAddressBase58: string;
//   totpSecret: string;
//   backupHash: `0x${string}`;
// }): Promise<{ ok: true; tx: any; calldata: `0x${string}`; signerAddress: string }> {
//   if (!CFG.policyContract) {
//     throw new Error("POLICY_CONTRACT missing in config");
//   }

//   if (CFG.mockRofl) {
//     console.log("MOCK_ROFL=1, skipping Sapphire transaction");
//     return {
//       ok: true,
//       tx: { mocked: true },
//       calldata: "0x" as `0x${string}`,
//       signerAddress: "0x0000000000000000000000000000000000000000",
//     };
//   }

//   const calldata = encodeFunctionData({
//     abi: PolicyAbi,
//     functionName: "registerUser",
//     args: [
//       uidHash(args.uid),
//       args.evmAddress,
//       solanaPubkeyToBytes32(args.solanaAddressBase58),
//       totpHash(args.totpSecret),
//       args.backupHash,
//     ],
//   });

//   // Get the ROFL signer wallet (key derived inside TEE)
//   const wallet = await getRoflSignerWallet();

//   console.log(`Sending registerUser tx from ROFL signer: ${wallet.address}`);
//   console.log(`  -> Policy contract: ${CFG.policyContract}`);
//   console.log(`  -> uidHash: ${uidHash(args.uid)}`);
//   console.log(`  -> evmAddress: ${args.evmAddress}`);

//   try {
//     // Check balance first
//     const balance = await wallet.provider!.getBalance(wallet.address);
//     console.log(`ROFL signer balance: ${balance.toString()} wei`);

//     if (balance === 0n) {
//       throw new Error(
//         `ROFL signer ${wallet.address} has no ROSE balance on Sapphire Testnet. ` +
//           `Please fund this address with TEST ROSE from https://faucet.testnet.oasis.io/`
//       );
//     }

//     // Send the transaction
//     const tx = await wallet.sendTransaction({
//       to: CFG.policyContract,
//       data: calldata,
//       gasLimit: 500000, // Higher limit for safety with Sapphire
//     });

//     console.log(`Transaction sent: ${tx.hash}`);

//     // Wait for confirmation
//     const receipt = await tx.wait();
//     console.log(`Transaction confirmed in block: ${receipt?.blockNumber}`);

//     if (receipt?.status === 0) {
//       throw new Error(`Transaction reverted: ${tx.hash}`);
//     }

//     return {
//       ok: true,
//       tx: {
//         hash: receipt?.hash,
//         blockNumber: receipt?.blockNumber,
//         status: receipt?.status,
//       },
//       calldata,
//       signerAddress: wallet.address,
//     };
//   } catch (error: any) {
//     // Provide more helpful error messages
//     if (error.code === "INSUFFICIENT_FUNDS") {
//       throw new Error(
//         `ROFL signer ${wallet.address} has insufficient ROSE for gas. ` +
//           `Fund it at https://faucet.testnet.oasis.io/`
//       );
//     }
//     if (error.message?.includes("already registered")) {
//       console.warn(`User already registered on Sapphire (uid: ${args.uid})`);
//       return {
//         ok: true,
//         tx: { alreadyRegistered: true },
//         calldata,
//         signerAddress: wallet.address,
//       };
//     }
//     throw error;
//   }
// }

import { encodeFunctionData, keccak256, toHex } from "viem";
import { PublicKey } from "@solana/web3.js";
import { Wallet, JsonRpcProvider } from "ethers";
import { roflKeyGenerate } from "./rofl.js";
import { CFG } from "./config.js";

export function totpHash(secret: string): `0x${string}` {
  return keccak256(toHex(secret));
}

export function uidHash(uid: string): `0x${string}` {
  return keccak256(toHex(uid));
}

/**
 * Convert base58 Solana pubkey to bytes32 hex (0x + 64 hex chars)
 */
export function solanaPubkeyToBytes32(solanaAddressBase58: string): `0x${string}` {
  const pk = new PublicKey(solanaAddressBase58);
  const bytes = pk.toBytes(); // Uint8Array(32)
  const hex = Buffer.from(bytes).toString("hex");
  return `0x${hex}` as `0x${string}`;
}

// ✅ Contract signature matches PawPadPolicy.sol exactly
const PolicyAbi = [
  {
    type: "function",
    name: "registerUser",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "evmAddress", type: "address" },
      { name: "solanaPubkey", type: "bytes32" },
      { name: "totpSecretHash", type: "bytes32" },
      { name: "backupBlobHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateCommitments",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "newTotpSecretHash", type: "bytes32" },
      { name: "newBackupBlobHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getUser",
    stateMutability: "view",
    inputs: [{ name: "uidHash", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "evmAddress", type: "address" },
          { name: "solanaPubkey", type: "bytes32" },
          { name: "totpSecretHash", type: "bytes32" },
          { name: "backupBlobHash", type: "bytes32" },
          { name: "recoveryPendingUntil", type: "uint64" },
          { name: "frozen", type: "bool" },
          { name: "flags", type: "uint32" },
        ],
      },
    ],
  },
] as const;

// Key ID for the ROFL signer - deterministically derives the same key each time
const ROFL_SIGNER_KEY_ID = "pawpad:sapphire:signer:v1";

// Cache the wallet to avoid regenerating on every call
let cachedWallet: Wallet | null = null;
let cachedWalletAddress: string | null = null;

/**
 * Normalize a hex key to the format ethers.js expects:
 */
function normalizePrivateKey(key: string): string {
  let hex = key.startsWith("0x") ? key.slice(2) : key;
  hex = hex.trim().replace(/\s/g, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`Invalid private key hex`);
  if (hex.length !== 64) throw new Error(`Invalid private key length`);
  return `0x${hex}`;
}

async function getRoflSignerWallet(): Promise<Wallet> {
  if (cachedWallet) return cachedWallet;
  console.log(`Generating ROFL key with key_id: ${ROFL_SIGNER_KEY_ID}`);
  const rawKey = await roflKeyGenerate(ROFL_SIGNER_KEY_ID, "secp256k1");
  const secretKeyHex = normalizePrivateKey(rawKey);
  const sapphireRpcUrl = CFG.sapphireRpc || "https://testnet.sapphire.oasis.io";
  const chainId = CFG.sapphireChainId || 23295;
  const provider = new JsonRpcProvider(sapphireRpcUrl, chainId);
  cachedWallet = new Wallet(secretKeyHex, provider);
  cachedWalletAddress = await cachedWallet.getAddress();
  console.log(`ROFL Sapphire signer initialized: ${cachedWalletAddress}`);
  return cachedWallet;
}

export async function getRoflSignerAddress(): Promise<string> {
  if (cachedWalletAddress) return cachedWalletAddress;
  const wallet = await getRoflSignerWallet();
  return wallet.address;
}

export async function getRoflSignerBalance(): Promise<string> {
  const wallet = await getRoflSignerWallet();
  const balance = await wallet.provider!.getBalance(wallet.address);
  return balance.toString();
}

const AuditAbi = [
  {
    type: "function",
    name: "recordExecution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uidHash", type: "bytes32" },
      { name: "action", type: "string" },
      { name: "execHash", type: "bytes32" },
      { name: "meta", type: "string" },
    ],
    outputs: [],
  },
] as const;

export async function sapphireRecordAudit(args: {
  uid: string;
  action: string;
  txHash: string; // Used as execHash
  meta: string;
}) {
  if (!CFG.auditContract) throw new Error("AUDIT_CONTRACT missing");
  // Encode execution hash (simpler to just keccak the tx hash again or use directly if 32 bytes)
  // Let's assume txHash is 0x... hex string.
  const execHash = keccak256(toHex(args.txHash));

  return sendSapphireTx("recordExecution", [
    uidHash(args.uid),
    args.action,
    execHash,
    args.meta
  ], CFG.auditContract); // Overload helper to accept target address
}

/**
 * Helper to send any tx to Policy or Audit Contract
 */
async function sendSapphireTx(functionName: string, args: any[], targetContract: string = ""): Promise<any> {
  const to = targetContract || CFG.policyContract;
  if (!to) throw new Error("Target contract missing in config");

  if (CFG.mockRofl) {
    console.log(`MOCK_ROFL=1, skipping ${functionName}`);
    return { ok: true, tx: { mocked: true } };
  }

  // Determine ABI based on contract target (Hacky but effective for now)
  const abi = to === CFG.policyContract ? PolicyAbi : AuditAbi;

  const calldata = encodeFunctionData({
    abi: abi as any,
    functionName: functionName as any,
    args: args as any,
  });

  const wallet = await getRoflSignerWallet();
  try {
    const tx = await wallet.sendTransaction({
      to,
      data: calldata,
      gasLimit: 500000,
    });
    console.log(`${functionName} sent: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status === 0) throw new Error(`Transaction reverted: ${tx.hash}`);
    return { ok: true, tx: receipt };
  } catch (error: any) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      throw new Error(`ROFL signer ${wallet.address} has insufficient ROSE.`);
    }
    throw error;
  }
}

export async function registerUserOnSapphire(args: {
  uid: string;
  evmAddress: `0x${string}`;
  solanaAddressBase58: string;
  totpSecret: string;
  backupHash: `0x${string}`;
}) {
  return sendSapphireTx("registerUser", [
    uidHash(args.uid),
    args.evmAddress,
    solanaPubkeyToBytes32(args.solanaAddressBase58),
    totpHash(args.totpSecret),
    args.backupHash,
  ]);
}

export async function sapphireUpdateCommitments(args: {
  uid: string;
  newTotpSecret: string;
  newBackupHash: `0x${string}`;
}) {
  return sendSapphireTx("updateCommitments", [
    uidHash(args.uid),
    totpHash(args.newTotpSecret),
    args.newBackupHash,
  ]);
}