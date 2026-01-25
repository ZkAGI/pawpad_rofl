import { ethers, Wallet } from "ethers";
import { Keypair, Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
import { sapphireRecordAudit } from "./sapphire.js";

// Token addresses per chain
const USDC_ADDRESSES: Record<string, string> = {
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
};

// Default RPC URLs
const RPC_URLS: Record<string, string> = {
    base: "https://mainnet.base.org",
    ethereum: "https://ethereum-rpc.publicnode.com"
};

// ERC20 ABI for token transfers
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function decimals() view returns (uint8)"
];

// SPL Token Program ID for Solana
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface WithdrawRequest {
    uid: string;
    chain: "base" | "ethereum" | "solana";
    token: "native" | "usdc";
    toAddress: string;
    amount: string; // Human readable amount (e.g., "0.1" ETH or "50" USDC)
}


export interface WithdrawResult {
    ok: boolean;
    txHash?: string;
    error?: string;
    gasUsed?: string;
}

/**
 * Withdraw funds from user's PawPad wallet to an external address
 * This is a critical function - all operations happen inside TEE
 */
export async function executeWithdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    const { uid, chain, token, toAddress, amount } = request;

    try {
        if (chain === "base" || chain === "ethereum") {
            return await executeEvmWithdraw(uid, chain, token, toAddress, amount);
        } else if (chain === "solana") {
            return await executeSolanaWithdraw(uid, token, toAddress, amount);
        } else {
            return { ok: false, error: `Unsupported chain: ${chain}` };
        }
    } catch (err: any) {
        console.error(`Withdraw failed for ${uid}:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Execute withdrawal on EVM chains (Base, Ethereum)
 */
async function executeEvmWithdraw(
    uid: string,
    chain: "base" | "ethereum",
    token: "native" | "usdc",
    toAddress: string,
    amount: string
): Promise<WithdrawResult> {
    // 1. Validate address
    if (!ethers.isAddress(toAddress)) {
        return { ok: false, error: "Invalid EVM address" };
    }

    // 2. Get chain-specific config
    const rpcUrl = process.env[`${chain.toUpperCase()}_RPC_URL`] || RPC_URLS[chain];
    const usdcAddress = USDC_ADDRESSES[chain];

    // 3. Derive private key inside TEE
    const pk = await deriveEvmPrivKeyHex(uid);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(pk, provider);

    console.log(`[Withdraw] Processing ${token} withdrawal on ${chain} for ${uid} to ${toAddress}`);

    let txHash = "";

    let gasUsed = "";

    if (token === "native") {
        // 3a. Native ETH Transfer
        const amountWei = ethers.parseEther(amount);

        // Check balance
        const balance = await provider.getBalance(wallet.address);
        const estimatedGas = 21000n; // Standard ETH transfer gas
        const feeData = await provider.getFeeData();
        const maxFee = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
        const totalCost = amountWei + (estimatedGas * maxFee);

        if (balance < totalCost) {
            return {
                ok: false,
                error: `Insufficient balance. Have: ${ethers.formatEther(balance)} ETH, Need: ${ethers.formatEther(totalCost)} ETH (including gas)`
            };
        }

        const tx = await wallet.sendTransaction({
            to: toAddress,
            value: amountWei,
            gasLimit: estimatedGas
        });

        console.log(`[Withdraw] ETH TX sent: ${tx.hash}`);
        const receipt = await tx.wait();

        if (receipt?.status === 0) {
            return { ok: false, error: "Transaction reverted" };
        }

        txHash = receipt?.hash || tx.hash;
        gasUsed = receipt?.gasUsed?.toString() || "";

    } else if (token === "usdc") {
        // 3b. USDC Token Transfer
        const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, wallet);

        // USDC has 6 decimals
        const amountUnits = ethers.parseUnits(amount, 6);

        // Check USDC balance
        const balance = await usdcContract.balanceOf(wallet.address);
        if (balance < amountUnits) {
            return {
                ok: false,
                error: `Insufficient USDC balance. Have: ${ethers.formatUnits(balance, 6)}, Need: ${amount}`
            };
        }

        // Check ETH for gas
        const ethBalance = await provider.getBalance(wallet.address);
        if (ethBalance < ethers.parseEther("0.0005")) {
            return { ok: false, error: "Insufficient ETH for gas fees" };
        }

        const tx = await usdcContract.transfer(toAddress, amountUnits);
        console.log(`[Withdraw] USDC TX sent: ${tx.hash}`);
        const receipt = await tx.wait();

        if (receipt?.status === 0) {
            return { ok: false, error: "Transaction reverted" };
        }

        txHash = receipt?.hash || tx.hash;
        gasUsed = receipt?.gasUsed?.toString() || "";
    }

    // 4. Record audit on-chain
    try {
        await sapphireRecordAudit({
            uid,
            action: `WITHDRAW_${token.toUpperCase()}_${chain.toUpperCase()}`,
            txHash,
            meta: JSON.stringify({ to: toAddress, amount })
        });
    } catch (e) {
        console.warn("Audit log failed (non-critical):", e);
    }

    return { ok: true, txHash, gasUsed };
}

/**
 * Execute withdrawal on Solana
 */
async function executeSolanaWithdraw(
    uid: string,
    token: "native" | "usdc",
    toAddress: string,
    amount: string
): Promise<WithdrawResult> {
    // 1. Derive Solana keypair inside TEE
    const pkHex = await deriveSolanaPrivKeyHex(uid);
    const seed = Uint8Array.from(Buffer.from(pkHex.slice(0, 64), "hex"));
    const keypair = Keypair.fromSeed(seed);

    // 2. Validate destination address
    let toPubkey: PublicKey;
    try {
        toPubkey = new PublicKey(toAddress);
    } catch {
        return { ok: false, error: "Invalid Solana address" };
    }

    const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        "confirmed"
    );

    console.log(`[Withdraw] Processing ${token} Solana withdrawal for ${uid} to ${toAddress}`);

    if (token === "native") {
        // 3a. Native SOL Transfer
        const lamports = Math.floor(parseFloat(amount) * 1e9); // SOL has 9 decimals

        // Check balance
        const balance = await connection.getBalance(keypair.publicKey);
        const rentExempt = 5000; // Minimum rent + fee buffer

        if (balance < lamports + rentExempt) {
            return {
                ok: false,
                error: `Insufficient SOL balance. Have: ${balance / 1e9}, Need: ${(lamports + rentExempt) / 1e9}`
            };
        }

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: toPubkey,
                lamports: lamports
            })
        );

        try {
            const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
            console.log(`[Withdraw] SOL TX confirmed: ${signature}`);

            // Record audit
            try {
                await sapphireRecordAudit({
                    uid,
                    action: "WITHDRAW_SOL_SOLANA",
                    txHash: signature,
                    meta: JSON.stringify({ to: toAddress, amount })
                });
            } catch (e) {
                console.warn("Audit log failed:", e);
            }

            return { ok: true, txHash: signature };
        } catch (err: any) {
            return { ok: false, error: `Solana TX failed: ${err.message}` };
        }

    } else if (token === "usdc") {
        // 3b. SPL USDC Transfer (requires associated token accounts)
        // This is more complex - requires @solana/spl-token library
        // For MVP, return not implemented
        return {
            ok: false,
            error: "Solana USDC withdrawal requires SPL token setup. Use native SOL for now."
        };
    }

    return { ok: false, error: "Unknown token type" };
}
