import { privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import { deriveEvmPrivKey, deriveSolanaSeed32 } from "./keys.js";

export async function deriveWallets(uid: string) {
  const evmPk = await deriveEvmPrivKey(uid);
  const evm = privateKeyToAccount(evmPk);

  const sol = Keypair.fromSeed(await deriveSolanaSeed32(uid));
  const solPub32Hex = Buffer.from(sol.publicKey.toBytes()).toString("hex");

  return {
    evmAddress: evm.address as `0x${string}`,
    solanaAddress: sol.publicKey.toBase58(),
    solanaPubkey32: (`0x${solPub32Hex}` as `0x${string}`)
  };
}

