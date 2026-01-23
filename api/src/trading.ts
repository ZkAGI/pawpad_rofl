// import axios from "axios";
// import { UserConfig, TradeHistory, SignalLog } from "./database.js";
// import { CFG } from "./config.js";
// import { getWallets } from "./wallets.js";
// import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
// import { ethers, Wallet } from "ethers";
// import { sapphireRecordAudit } from "./sapphire.js";
// // import { Connection, Transaction, SystemProgram, PublicKey } from "@solana/web3.js"; // Note: Solana requires more boilerplate

// // Standard ERC20/Router generic ABI fragments
// const ERC20_ABI = [
//     "function balanceOf(address owner) view returns (uint256)",
//     "function approve(address spender, uint256 value) returns (bool)",
//     "function transfer(address to, uint256 value) returns (bool)"
// ];

// // Placeholder for router - replace with actual local DEX router address (e.g. Aerodrome on Base)
// const DEX_ROUTER_ADDRESS = "0x...router...";
// const USDC_ADDRESS = "0x...usdc...";
// const WETH_ADDRESS = "0x...weth...";

// export async function fetchSignal(asset: "ETH" | "SOL") {
//     const url = asset === "ETH" ? CFG.signalApiEth : CFG.signalApiSol;
//     try {
//         const res = await axios.get(url, { timeout: 10000 });
//         // Log for debugging
//         await SignalLog.create({ asset, payload: res.data });
//         return res.data;
//     } catch (error: any) {
//         console.warn(`Failed to fetch signal for ${asset}:`, error.message);
//         return null;
//     }
// }

// export async function runTradingCycle() {
//     console.log("Starting trading cycle...");
//     const signals = {
//         ETH: await fetchSignal("ETH"),
//         SOL: await fetchSignal("SOL")
//     };

//     // Iterate over all users who have enabled trading
//     // Note: In a massive scale app, use a cursor. For TEE memory limits, this is fine for thousands of users.
//     const users = await UserConfig.find({ tradingEnabled: true });

//     for (const user of users) {
//         try {
//             if (signals.ETH && user.allowedAssets.includes("ETH")) {
//                 await processUserTrade(user, "ETH", signals.ETH);
//             }
//             if (signals.SOL && user.allowedAssets.includes("SOL")) {
//                 await processUserTrade(user, "SOL", signals.SOL);
//             }
//         } catch (e) {
//             console.error(`Error processing trade for user ${user.uid}:`, e);
//         }
//     }
// }

// async function processUserTrade(user: any, asset: "ETH" | "SOL", signalData: any) {
//     const signal = signalData.signal; // "BUY", "SELL", "HOLD"

//     // Logic: Simple strategy
//     // If BUY -> Buy 'maxTradeAmountUsdc' worth of Asset
//     // If SELL -> Sell all Asset holdings into USDC
//     // If HOLD -> Do nothing

//     if (signal === "HOLD") return;

//     const uid = user.uid;
//     console.log(`Executing ${signal} on ${asset} for ${uid}`);

//     let txHash = "";

//     if (asset === "ETH") {
//         // EVM Execution
//         const pk = await deriveEvmPrivKeyHex(uid);
//         const wallet = new Wallet(pk);
//         // Need a provider to broadcast. user must supply RPC in production or we use a public one
//         // const provider = new JsonRpcProvider("https://mainnet.base.org"); 
//         // const signer = wallet.connect(provider);

//         // --- MOCK EXECUTION FOR PROTOTYPE ---
//         // In real implementation:
//         // 1. Check Allowance of USDC to Router
//         // 2. Approve if needed
//         // 3. Call swapExactTokensForTokens

//         // Simulating TX Hash
//         txHash = ethers.id(`mock-tx-${uid}-${Date.now()}`);
//         console.log(`[EVM] Signed trade with ${wallet.address}: ${txHash}`);

//     } else if (asset === "SOL") {
//         // Solana Execution
//         const pkHex = await deriveSolanaPrivKeyHex(uid);
//         // const seed = Uint8Array.from(Buffer.from(pkHex.slice(0, 64), "hex"));
//         // const keypair = Keypair.fromSeed(seed);

//         // --- MOCK EXECUTION FOR PROTOTYPE ---
//         txHash = "sol-mock-tx-" + Date.now();
//         console.log(`[SOL] Signed trade for ${asset}: ${txHash}`);
//     }

//     // Record history (DB)
//     await TradeHistory.create({
//         uid,
//         asset,
//         signal,
//         signalPrice: signalData.price,
//         chain: asset === "ETH" ? "base" : "solana",
//         txHash,
//         amountIn: String(user.maxTradeAmountUsdc), // Simplified
//         tokenIn: signal === "BUY" ? "USDC" : asset,
//         status: "success"
//     });

//     // Record Audit (On-Chain) - Best Effort
//     try {
//         await sapphireRecordAudit({
//             uid,
//             action: `TRADE_${signal}_${asset}`,
//             txHash,
//             meta: JSON.stringify({ price: signalData.price, amount: user.maxTradeAmountUsdc })
//         });
//         console.log(`Audit log confirmed for ${uid}`);
//     } catch (e) {
//         console.warn("Audit log failed (non-critical):", e);
//     }
// }


import axios from "axios";
import { UserConfig, TradeHistory, SignalLog } from "./database.js";
import { CFG } from "./config.js";
import { getWallets } from "./wallets.js";
import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
import { ethers, Wallet } from "ethers";
import { sapphireRecordAudit } from "./sapphire.js";
// import { Connection, Transaction, SystemProgram, PublicKey } from "@solana/web3.js"; 
// Standard ERC20 ABI
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function transfer(address to, uint256 value) returns (bool)"
];
// --- CONSTANTS (BASE NETWORK) ---
// BaseSwap / Uniswap V2 Compatible Router
const ROUTER_ADDRESS = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Native USDC
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // WETH
export async function fetchSignal(asset: "ETH" | "SOL") {
    const url = asset === "ETH" ? CFG.signalApiEth : CFG.signalApiSol;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        // Log raw signal for debugging
        await SignalLog.create({ asset, payload: res.data });
        return res.data;
    } catch (error: any) {
        console.warn(`Failed to fetch signal for ${asset}:`, error.message);
        return null;
    }
}
export async function runTradingCycle() {
    console.log("Starting trading cycle...");
    const signals = {
        ETH: await fetchSignal("ETH"),
        SOL: await fetchSignal("SOL")
    };
    // Iterate over all users who have enabled trading
    const users = await UserConfig.find({ tradingEnabled: true });
    for (const user of users) {
        try {
            if (signals.ETH && user.allowedAssets.includes("ETH")) {
                await processUserTrade(user, "ETH", signals.ETH);
            }
            if (signals.SOL && user.allowedAssets.includes("SOL")) {
                await processUserTrade(user, "SOL", signals.SOL);
            }
        } catch (e) {
            console.error(`Error processing trade for user ${user.uid}:`, e);
        }
    }
}
async function processUserTrade(user: any, asset: "ETH" | "SOL", signalData: any) {
    const signal = signalData.signal; // "BUY", "SELL", "HOLD"
    // HOLD strategy: Do nothing
    if (signal === "HOLD") return;
    const uid = user.uid;
    console.log(`Executing ${signal} on ${asset} for ${uid} (Price: ${signalData.price})`);
    let txHash = "";
    if (asset === "ETH") {
        // --- EVM Execution (Base Network) ---
        try {
            const pk = await deriveEvmPrivKeyHex(uid);

            // 1. Setup Provider & Wallet
            // Fallback to public RPC if env var is missing
            const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || "https://mainnet.base.org");
            const wallet = new Wallet(pk, provider);
            // 2. Setup Contracts
            const routerAbi = [
                "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
                "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
                "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
            ];
            const router = new ethers.Contract(ROUTER_ADDRESS, routerAbi, wallet);
            const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
            // 3. Execute Trade
            if (signal === "BUY") {
                // Strategy: Buy ETH with 'maxTradeAmountUsdc'
                const amountIn = ethers.parseUnits(String(user.maxTradeAmountUsdc), 6); // USDC = 6 decimals
                // Check Allowance
                const allowance = await usdcContract.balanceOf(wallet.address);
                if (allowance < amountIn) {
                    console.log(`Approving USDC for ${uid}...`);
                    const approveTx = await usdcContract.approve(ROUTER_ADDRESS, amountIn);
                    await approveTx.wait();
                }
                // Swap USDC -> WETH aka ETH
                const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 mins
                const tx = await router.swapExactTokensForETH(
                    amountIn,
                    0, // Slippage unchecked (Use Oracle/Quoter in Production!)
                    [USDC_ADDRESS, WETH_ADDRESS],
                    wallet.address,
                    deadline
                );
                console.log(`[EVM] Buy TX Sent: ${tx.hash}`);
                const receipt = await tx.wait();
                txHash = receipt.hash;
            } else if (signal === "SELL") {
                // Strategy: Sell (Investment Value) worth of ETH back to USDC
                // Amount ETH = (USD Amount) / (Price)
                const amountEthFloat = user.maxTradeAmountUsdc / signalData.price;
                const amountEthWei = ethers.parseEther(amountEthFloat.toFixed(18));
                // Check Balance
                const bal = await provider.getBalance(wallet.address);
                if (bal < amountEthWei) {
                    console.warn(`Insufficient ETH balance for ${uid}. Have: ${bal}, Need: ${amountEthWei}`);
                    return; // Exit w/o trade
                }
                // Swap ETH -> USDC
                const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
                const tx = await router.swapExactETHForTokens(
                    0,
                    [WETH_ADDRESS, USDC_ADDRESS],
                    wallet.address,
                    deadline,
                    { value: amountEthWei }
                );
                console.log(`[EVM] Sell TX Sent: ${tx.hash}`);
                const receipt = await tx.wait();
                txHash = receipt.hash;
            }
        } catch (err: any) {
            console.error(`EVM Trade failed for ${uid}:`, err.message);
            txHash = "failed";
        }
    } else if (asset === "SOL") {
        // --- Solana Execution ---
        // Placeholder: Requires Jupiter API + @solana/web3.js
        console.warn("Solana trading requires additional Jupiter API setup.");
        txHash = "sol-simulation-" + Date.now();
    }
    // 4. Record Trade History (Database)
    if (txHash === "") return; // No trade attempted
    await TradeHistory.create({
        uid,
        asset,
        signal,
        signalPrice: signalData.price,
        chain: asset === "ETH" ? "base" : "solana",
        txHash,
        amountIn: String(user.maxTradeAmountUsdc),
        tokenIn: signal === "BUY" ? "USDC" : asset,
        status: txHash === "failed" ? "failed" : "success"
    });
    // 5. Record On-Chain Audit (Sapphire)
    if (txHash && txHash !== "failed") {
        try {
            await sapphireRecordAudit({
                uid,
                action: `TRADE_${signal}_${asset}`,
                txHash,
                meta: JSON.stringify({ price: signalData.price, amount: user.maxTradeAmountUsdc })
            });
            console.log(`Audit log confirmed for ${uid}`);
        } catch (e) {
            console.warn("Audit log failed (non-critical):", e);
        }
    }
}