// import { privateKeyToAccount } from "viem/accounts";
// import { Keypair } from "@solana/web3.js";
// import { evmPrivKey, solanaSeed32 } from "./keys.js";

// export async function walletsFor(uid: string): Promise<{
//   evm: { chain: "sapphire-testnet"; address: `0x${string}` };
//   solana: { address: string; pubkey32hex: string };
// }> {
//   const pk = await evmPrivKey(uid);
//   const evm = privateKeyToAccount(pk);

//   const seed32 = await solanaSeed32(uid);
//   const sol = Keypair.fromSeed(seed32);
//   const pub32hex = Buffer.from(sol.publicKey.toBytes()).toString("hex");

//   return {
//     evm: { chain: "sapphire-testnet", address: evm.address },
//     solana: { address: sol.publicKey.toBase58(), pubkey32hex: pub32hex }
//   };
// }

import { privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";

export async function getWallets(uid: string) {
  const evmPkHex = await deriveEvmPrivKeyHex(uid);
  const evm = privateKeyToAccount(("0x" + evmPkHex.slice(0, 64)) as `0x${string}`);

  const solHex = await deriveSolanaPrivKeyHex(uid);
  const seed32 = Uint8Array.from(Buffer.from(solHex.slice(0, 64), "hex"));
  const sol = Keypair.fromSeed(seed32);

  return {
    evm: { chain: "base", address: evm.address },
    solana: { address: sol.publicKey.toBase58() },
  };
}
