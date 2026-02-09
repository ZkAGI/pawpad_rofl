
// import axios from "axios";
// import { UserConfig, TradeHistory, SignalLog } from "./database.js";
// import { CFG } from "./config.js";
// import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
// import { ethers, Wallet } from "ethers";
// import { sapphireRecordAudit } from "./sapphire.js";
// import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";

// // Standard ERC20 ABI
// const ERC20_ABI = [
//     "function balanceOf(address owner) view returns (uint256)",
//     "function approve(address spender, uint256 value) returns (bool)",
//     "function transfer(address to, uint256 value) returns (bool)"
// ];

// // --- CONSTANTS (BASE NETWORK) ---
// const ROUTER_ADDRESS = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
// const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// // --- CONSTANTS (SOLANA) ---
// const SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL
// const USDC_MINT_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC on Solana
// const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
// const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";

// export async function fetchSignal(asset: "ETH" | "SOL") {
//     const url = asset === "ETH" ? CFG.signalApiEth : CFG.signalApiSol;
//     try {
//         const res = await axios.get(url, { timeout: 10000 });
//         // Log raw signal for debugging
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
//     // HOLD strategy: Do nothing
//     if (signal === "HOLD") return;
//     const uid = user.uid;
//     console.log(`Executing ${signal} on ${asset} for ${uid} (Price: ${signalData.price})`);
//     let txHash = "";
//     if (asset === "ETH") {
//         // --- EVM Execution (Base Network) ---
//         try {
//             const pk = await deriveEvmPrivKeyHex(uid);

//             // 1. Setup Provider & Wallet
//             // Fallback to public RPC if env var is missing
//             const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || "https://mainnet.base.org");
//             const wallet = new Wallet(pk, provider);
//             // 2. Setup Contracts
//             const routerAbi = [
//                 "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//                 "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//                 "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
//             ];
//             const router = new ethers.Contract(ROUTER_ADDRESS, routerAbi, wallet);
//             const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
//             // 3. Execute Trade
//             if (signal === "BUY") {
//                 // Strategy: Buy ETH with 'maxTradeAmountUsdc'
//                 const amountIn = ethers.parseUnits(String(user.maxTradeAmountUsdc), 6); // USDC = 6 decimals

//                 // Check USDC balance first
//                 const balance = await usdcContract.balanceOf(wallet.address);
//                 if (balance < amountIn) {
//                     console.warn(`Insufficient USDC balance for ${uid}. Have: ${ethers.formatUnits(balance, 6)}, Need: ${user.maxTradeAmountUsdc}`);
//                     return; // Exit without trade
//                 }

//                 // Approve USDC spending
//                 console.log(`Approving USDC for ${uid}...`);
//                 const approveTx = await usdcContract.approve(ROUTER_ADDRESS, amountIn);
//                 await approveTx.wait();

//                 // Swap USDC -> WETH aka ETH
//                 const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 mins
//                 const tx = await router.swapExactTokensForETH(
//                     amountIn,
//                     0, // Slippage unchecked (Use Oracle/Quoter in Production!)
//                     [USDC_ADDRESS, WETH_ADDRESS],
//                     wallet.address,
//                     deadline
//                 );
//                 console.log(`[EVM] Buy TX Sent: ${tx.hash}`);
//                 const receipt = await tx.wait();
//                 txHash = receipt.hash;
//             } else if (signal === "SELL") {
//                 // Strategy: Sell (Investment Value) worth of ETH back to USDC
//                 // Amount ETH = (USD Amount) / (Price)
//                 const amountEthFloat = user.maxTradeAmountUsdc / signalData.price;
//                 const amountEthWei = ethers.parseEther(amountEthFloat.toFixed(18));
//                 // Check Balance
//                 const bal = await provider.getBalance(wallet.address);
//                 if (bal < amountEthWei) {
//                     console.warn(`Insufficient ETH balance for ${uid}. Have: ${bal}, Need: ${amountEthWei}`);
//                     return; // Exit w/o trade
//                 }
//                 // Swap ETH -> USDC
//                 const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
//                 const tx = await router.swapExactETHForTokens(
//                     0,
//                     [WETH_ADDRESS, USDC_ADDRESS],
//                     wallet.address,
//                     deadline,
//                     { value: amountEthWei }
//                 );
//                 console.log(`[EVM] Sell TX Sent: ${tx.hash}`);
//                 const receipt = await tx.wait();
//                 txHash = receipt.hash;
//             }
//         } catch (err: any) {
//             console.error(`EVM Trade failed for ${uid}:`, err.message);
//             txHash = "failed";
//         }
//     } else if (asset === "SOL") {
//         // --- Solana Execution via Jupiter ---
//         try {
//             // 1. Derive Solana keypair inside TEE
//             const pkHex = await deriveSolanaPrivKeyHex(uid);
//             const seed = Uint8Array.from(Buffer.from(pkHex.slice(0, 64), "hex"));
//             const keypair = Keypair.fromSeed(seed);
//             const walletPubkey = keypair.publicKey.toString();

//             console.log(`[SOL] Trading for ${uid} with wallet ${walletPubkey}`);

//             // 2. Setup connection
//             const connection = new Connection(
//                 process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
//                 "confirmed"
//             );

//             // 3. Determine swap direction
//             let inputMint: string;
//             let outputMint: string;
//             let amount: number;

//             if (signal === "BUY") {
//                 // BUY SOL: Swap USDC -> SOL
//                 inputMint = USDC_MINT_SOL;
//                 outputMint = SOL_MINT;
//                 // USDC has 6 decimals
//                 amount = Math.floor(user.maxTradeAmountUsdc * 1e6);
//             } else {
//                 // SELL SOL: Swap SOL -> USDC
//                 inputMint = SOL_MINT;
//                 outputMint = USDC_MINT_SOL;
//                 // Calculate SOL amount based on price (SOL has 9 decimals)
//                 const solAmount = user.maxTradeAmountUsdc / signalData.price;
//                 amount = Math.floor(solAmount * 1e9);
//             }

//             // 4. Get quote from Jupiter
//             const quoteUrl = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`;
//             console.log(`[SOL] Getting quote from Jupiter...`);
//             const quoteRes = await axios.get(quoteUrl, { timeout: 15000 });
//             const quoteData = quoteRes.data;

//             if (!quoteData || !quoteData.outAmount) {
//                 console.error(`[SOL] Invalid quote response for ${uid}`);
//                 txHash = "failed";
//             } else {
//                 console.log(`[SOL] Quote received: ${amount} -> ${quoteData.outAmount}`);

//                 // 5. Get swap transaction from Jupiter
//                 const swapRes = await axios.post(JUPITER_SWAP_API, {
//                     quoteResponse: quoteData,
//                     userPublicKey: walletPubkey,
//                     wrapAndUnwrapSol: true,
//                     dynamicComputeUnitLimit: true,
//                     prioritizationFeeLamports: "auto"
//                 }, { timeout: 30000 });

//                 const swapTxBase64 = swapRes.data.swapTransaction;

//                 if (!swapTxBase64) {
//                     console.error(`[SOL] No swap transaction returned for ${uid}`);
//                     txHash = "failed";
//                 } else {
//                     // 6. Deserialize, sign, and send transaction
//                     const swapTxBuf = Buffer.from(swapTxBase64, "base64");
//                     const transaction = VersionedTransaction.deserialize(swapTxBuf);

//                     // Sign with TEE-derived keypair
//                     transaction.sign([keypair]);

//                     // 7. Broadcast transaction
//                     console.log(`[SOL] Sending transaction...`);
//                     const signature = await connection.sendTransaction(transaction, {
//                         maxRetries: 3,
//                         skipPreflight: false
//                     });

//                     console.log(`[SOL] TX Sent: ${signature}`);

//                     // 8. Confirm transaction
//                     const confirmation = await connection.confirmTransaction(signature, "confirmed");

//                     if (confirmation.value.err) {
//                         console.error(`[SOL] TX failed for ${uid}:`, confirmation.value.err);
//                         txHash = "failed";
//                     } else {
//                         console.log(`[SOL] TX Confirmed: ${signature}`);
//                         txHash = signature;
//                     }
//                 }
//             }
//         } catch (err: any) {
//             console.error(`[SOL] Trade failed for ${uid}:`, err.message);
//             txHash = "failed";
//         }
//     }
//     // 4. Record Trade History (Database)
//     if (txHash === "") return; // No trade attempted
//     await TradeHistory.create({
//         uid,
//         asset,
//         signal,
//         signalPrice: signalData.price,
//         chain: asset === "ETH" ? "base" : "solana",
//         txHash,
//         amountIn: String(user.maxTradeAmountUsdc),
//         tokenIn: signal === "BUY" ? "USDC" : asset,
//         status: txHash === "failed" ? "failed" : "success"
//     });
//     // 5. Record On-Chain Audit (Sapphire)
//     if (txHash && txHash !== "failed") {
//         try {
//             await sapphireRecordAudit({
//                 uid,
//                 action: `TRADE_${signal}_${asset}`,
//                 txHash,
//                 meta: JSON.stringify({ price: signalData.price, amount: user.maxTradeAmountUsdc })
//             });
//             console.log(`Audit log confirmed for ${uid}`);
//         } catch (e) {
//             console.warn("Audit log failed (non-critical):", e);
//         }
//     }
// }



// import axios from "axios";
// import { UserConfig, TradeHistory, SignalLog } from "./database.js";
// import { CFG } from "./config.js";
// import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
// import { ethers, Wallet } from "ethers";
// import { sapphireRecordAudit } from "./sapphire.js";
// import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";

// // Standard ERC20 ABI
// const ERC20_ABI = [
//     "function balanceOf(address owner) view returns (uint256)",
//     "function approve(address spender, uint256 value) returns (bool)",
//     "function transfer(address to, uint256 value) returns (bool)"
// ];

// // --- CONSTANTS (BASE NETWORK) ---
// const ROUTER_ADDRESS = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
// const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// // --- CONSTANTS (SOLANA) ---
// const SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL
// const USDC_MINT_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC on Solana
// const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
// const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";

// export async function fetchSignal(asset: "ETH" | "SOL") {
//     const url = asset === "ETH" ? CFG.signalApiEth : CFG.signalApiSol;
//     try {
//         const res = await axios.get(url, { timeout: 10000 });
//         // Log raw signal for debugging
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
//     // HOLD strategy: Do nothing
//     if (signal === "HOLD") return;
//     const uid = user.uid;
//     console.log(`Executing ${signal} on ${asset} for ${uid} (Price: ${signalData.price}, Score: ${signalData.score || 'N/A'}, Conf: ${signalData.confidence || 'N/A'})`);
//     let txHash = "";
//     if (asset === "ETH") {
//         // --- EVM Execution (Base Network) ---
//         try {
//             const pk = await deriveEvmPrivKeyHex(uid);

//             // 1. Setup Provider & Wallet
//             // Fallback to public RPC if env var is missing
//             const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || "https://mainnet.base.org");
//             const wallet = new Wallet(pk, provider);
//             // 2. Setup Contracts
//             const routerAbi = [
//                 "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
//                 "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
//                 "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
//             ];
//             const router = new ethers.Contract(ROUTER_ADDRESS, routerAbi, wallet);
//             const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
//             // 3. Execute Trade
//             if (signal === "BUY") {
//                 // Strategy: Buy ETH with 'maxTradeAmountUsdc'
//                 const amountIn = ethers.parseUnits(String(user.maxTradeAmountUsdc), 6); // USDC = 6 decimals

//                 // Check USDC balance first
//                 const balance = await usdcContract.balanceOf(wallet.address);
//                 if (balance < amountIn) {
//                     console.warn(`Insufficient USDC balance for ${uid}. Have: ${ethers.formatUnits(balance, 6)}, Need: ${user.maxTradeAmountUsdc}`);
//                     return; // Exit without trade
//                 }

//                 // Approve USDC spending
//                 console.log(`Approving USDC for ${uid}...`);
//                 const approveTx = await usdcContract.approve(ROUTER_ADDRESS, amountIn);
//                 await approveTx.wait();

//                 // Swap USDC -> WETH aka ETH
//                 const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 mins
//                 const tx = await router.swapExactTokensForETH(
//                     amountIn,
//                     0, // Slippage unchecked (Use Oracle/Quoter in Production!)
//                     [USDC_ADDRESS, WETH_ADDRESS],
//                     wallet.address,
//                     deadline
//                 );
//                 console.log(`[EVM] Buy TX Sent: ${tx.hash}`);
//                 const receipt = await tx.wait();
//                 txHash = receipt.hash;
//             } else if (signal === "SELL") {
//                 // Strategy: Sell (Investment Value) worth of ETH back to USDC
//                 // Amount ETH = (USD Amount) / (Price)
//                 const amountEthFloat = user.maxTradeAmountUsdc / signalData.price;
//                 const amountEthWei = ethers.parseEther(amountEthFloat.toFixed(18));
//                 // Check Balance
//                 const bal = await provider.getBalance(wallet.address);
//                 if (bal < amountEthWei) {
//                     console.warn(`Insufficient ETH balance for ${uid}. Have: ${bal}, Need: ${amountEthWei}`);
//                     return; // Exit w/o trade
//                 }
//                 // Swap ETH -> USDC
//                 const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
//                 const tx = await router.swapExactETHForTokens(
//                     0,
//                     [WETH_ADDRESS, USDC_ADDRESS],
//                     wallet.address,
//                     deadline,
//                     { value: amountEthWei }
//                 );
//                 console.log(`[EVM] Sell TX Sent: ${tx.hash}`);
//                 const receipt = await tx.wait();
//                 txHash = receipt.hash;
//             }
//         } catch (err: any) {
//             console.error(`EVM Trade failed for ${uid}:`, err.message);
//             txHash = "failed";
//         }
//     } else if (asset === "SOL") {
//         // --- Solana Execution via Jupiter ---
//         try {
//             // 1. Derive Solana keypair inside TEE
//             const pkHex = await deriveSolanaPrivKeyHex(uid);
//             const seed = Uint8Array.from(Buffer.from(pkHex.slice(0, 64), "hex"));
//             const keypair = Keypair.fromSeed(seed);
//             const walletPubkey = keypair.publicKey.toString();

//             console.log(`[SOL] Trading for ${uid} with wallet ${walletPubkey}`);

//             // 2. Setup connection
//             const connection = new Connection(
//                 process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
//                 "confirmed"
//             );

//             // 3. Determine swap direction
//             let inputMint: string;
//             let outputMint: string;
//             let amount: number;

//             if (signal === "BUY") {
//                 // BUY SOL: Swap USDC -> SOL
//                 inputMint = USDC_MINT_SOL;
//                 outputMint = SOL_MINT;
//                 // USDC has 6 decimals
//                 amount = Math.floor(user.maxTradeAmountUsdc * 1e6);
//             } else {
//                 // SELL SOL: Swap SOL -> USDC
//                 inputMint = SOL_MINT;
//                 outputMint = USDC_MINT_SOL;
//                 // Calculate SOL amount based on price (SOL has 9 decimals)
//                 const solAmount = user.maxTradeAmountUsdc / signalData.price;
//                 amount = Math.floor(solAmount * 1e9);
//             }

//             // 4. Get quote from Jupiter
//             const quoteUrl = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`;
//             console.log(`[SOL] Getting quote from Jupiter...`);
//             const quoteRes = await axios.get(quoteUrl, { timeout: 15000 });
//             const quoteData = quoteRes.data;

//             if (!quoteData || !quoteData.outAmount) {
//                 console.error(`[SOL] Invalid quote response for ${uid}`);
//                 txHash = "failed";
//             } else {
//                 console.log(`[SOL] Quote received: ${amount} -> ${quoteData.outAmount}`);

//                 // 5. Get swap transaction from Jupiter
//                 const swapRes = await axios.post(JUPITER_SWAP_API, {
//                     quoteResponse: quoteData,
//                     userPublicKey: walletPubkey,
//                     wrapAndUnwrapSol: true,
//                     dynamicComputeUnitLimit: true,
//                     prioritizationFeeLamports: "auto"
//                 }, { timeout: 30000 });

//                 const swapTxBase64 = swapRes.data.swapTransaction;

//                 if (!swapTxBase64) {
//                     console.error(`[SOL] No swap transaction returned for ${uid}`);
//                     txHash = "failed";
//                 } else {
//                     // 6. Deserialize, sign, and send transaction
//                     const swapTxBuf = Buffer.from(swapTxBase64, "base64");
//                     const transaction = VersionedTransaction.deserialize(swapTxBuf);

//                     // Sign with TEE-derived keypair
//                     transaction.sign([keypair]);

//                     // 7. Broadcast transaction
//                     console.log(`[SOL] Sending transaction...`);
//                     const signature = await connection.sendTransaction(transaction, {
//                         maxRetries: 3,
//                         skipPreflight: false
//                     });

//                     console.log(`[SOL] TX Sent: ${signature}`);

//                     // 8. Confirm transaction
//                     const confirmation = await connection.confirmTransaction(signature, "confirmed");

//                     if (confirmation.value.err) {
//                         console.error(`[SOL] TX failed for ${uid}:`, confirmation.value.err);
//                         txHash = "failed";
//                     } else {
//                         console.log(`[SOL] TX Confirmed: ${signature}`);
//                         txHash = signature;
//                     }
//                 }
//             }
//         } catch (err: any) {
//             console.error(`[SOL] Trade failed for ${uid}:`, err.message);
//             txHash = "failed";
//         }
//     }
//     // 4. Record Trade History (Database)
//     if (txHash === "") return; // No trade attempted
//     await TradeHistory.create({
//         uid,
//         action: signal,
//         asset,
//         signal,
//         signalPrice: signalData.price,
//         chain: asset === "ETH" ? "base" : "solana",
//         txHash,
//         amountIn: String(user.maxTradeAmountUsdc),
//         tokenIn: signal === "BUY" ? "USDC" : asset,
//         status: txHash === "failed" ? "failed" : "success"
//     });
//     // 5. Record On-Chain Audit (Sapphire)
//     if (txHash && txHash !== "failed") {
//         try {
//             await sapphireRecordAudit({
//                 uid,
//                 action: `TRADE_${signal}_${asset}`,
//                 txHash,
//                 meta: JSON.stringify({ price: signalData.price, amount: user.maxTradeAmountUsdc })
//             });
//             console.log(`Audit log confirmed for ${uid}`);
//         } catch (e) {
//             console.warn("Audit log failed (non-critical):", e);
//         }
//     }
// }

import axios from "axios";
import { UserConfig, TradeHistory, SignalLog } from "./database.js";
import { CFG } from "./config.js";
import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
import { ethers, Wallet } from "ethers";
import { sapphireRecordAudit } from "./sapphire.js";
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";

// =========================
// HARD-CODE JUPITER API KEY
// =========================
// Paste your Jupiter API key here.
// (Do NOT commit this to public repos.)
const JUPITER_API_KEY = process.env.JUPITER_API_KEY

// Standard ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
];

// --- CONSTANTS (BASE NETWORK) ---
const ROUTER_ADDRESS = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// --- CONSTANTS (SOLANA) ---
const SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL mint
const USDC_MINT_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC mint (Solana)

// Jupiter Swap API (requires x-api-key)
const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap";

type TradeAction = "BUY" | "SELL" | "HOLD";

function normalizeAction(raw: any): TradeAction {
  const s = String(raw ?? "").toUpperCase();
  if (s === "BUY" || s === "SELL" || s === "HOLD") return s;
  return "HOLD";
}

function safeErrMsg(err: any) {
  if (err?.response?.data) {
    const status = err.response.status;
    const body =
      typeof err.response.data === "string"
        ? err.response.data
        : JSON.stringify(err.response.data);
    return `HTTP ${status}: ${body.slice(0, 600)}`;
  }
  return err?.message || String(err);
}

function requireJupiterKey() {
  if (!JUPITER_API_KEY) {
    throw new Error("JUPITER_API_KEY is not set");
  }
  return JUPITER_API_KEY;
}


export async function fetchSignal(asset: "ETH" | "SOL") {
  const url = asset === "ETH" ? CFG.signalApiEth : CFG.signalApiSol;
  try {
    const res = await axios.get(url, { timeout: 10000 });
    // Log raw signal for debugging
    await SignalLog.create({ asset, payload: res.data });
    return res.data;
  } catch (error: any) {
    console.warn(`Failed to fetch signal for ${asset}:`, safeErrMsg(error));
    return null;
  }
}

export async function runTradingCycle() {
  console.log("Starting trading cycle...");

  const signals = {
    ETH: await fetchSignal("ETH"),
    SOL: await fetchSignal("SOL"),
  };

  const users = await UserConfig.find({ tradingEnabled: true });

  for (const user of users) {
    try {
      if (signals.ETH && user.allowedAssets?.includes("ETH")) {
        await processUserTrade(user, "ETH", signals.ETH);
      }
      if (signals.SOL && user.allowedAssets?.includes("SOL")) {
        await processUserTrade(user, "SOL", signals.SOL);
      }
    } catch (e: any) {
      console.error(`Error processing trade for user ${user.uid}:`, safeErrMsg(e));
    }
  }
}

async function processUserTrade(user: any, asset: "ETH" | "SOL", signalData: any) {
  const uid = user.uid;

  // ALWAYS normalize
  const signal: TradeAction = normalizeAction(signalData?.signal);

  // HOLD means no trade
  if (signal === "HOLD") return;

  console.log(
    `Executing ${signal} on ${asset} for ${uid} (Price: ${signalData.price}, Score: ${
      signalData.score ?? "N/A"
    }, Conf: ${signalData.confidence ?? "N/A"})`
  );

  let txHash = "";
  let attempted = false;
  let failReason = "";

  if (asset === "ETH") {
    attempted = true;
    try {
      const pk = await deriveEvmPrivKeyHex(uid);
      const provider = new ethers.JsonRpcProvider(
        process.env.BASE_RPC_URL || "https://mainnet.base.org"
      );
      const wallet = new Wallet(pk, provider);

      const routerAbi = [
        "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
      ];

      const router = new ethers.Contract(ROUTER_ADDRESS, routerAbi, wallet);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

      if (signal === "BUY") {
        const amountIn = ethers.parseUnits(String(user.maxTradeAmountUsdc), 6);

        const balance = await usdcContract.balanceOf(wallet.address);
        if (balance < amountIn) {
          console.warn(
            `Insufficient USDC balance for ${uid}. Have: ${ethers.formatUnits(
              balance,
              6
            )}, Need: ${user.maxTradeAmountUsdc}`
          );
          txHash = "failed";
          failReason = "INSUFFICIENT_USDC";
        } else {
          console.log(`Approving USDC for ${uid}...`);
          const approveTx = await usdcContract.approve(ROUTER_ADDRESS, amountIn);
          await approveTx.wait();

          const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
          const tx = await router.swapExactTokensForETH(
            amountIn,
            0,
            [USDC_ADDRESS, WETH_ADDRESS],
            wallet.address,
            deadline
          );

          console.log(`[EVM] Buy TX Sent: ${tx.hash}`);
          const receipt = await tx.wait();
          txHash = receipt.hash;
        }
      } else if (signal === "SELL") {
        const price = Number(signalData.price);
        if (!price || price <= 0) {
          txHash = "failed";
          failReason = "INVALID_PRICE";
          console.warn(`[EVM] Invalid price in signal for ${uid}:`, signalData.price);
        } else {
          const amountEthFloat = Number(user.maxTradeAmountUsdc) / price;
          const amountEthWei = ethers.parseEther(amountEthFloat.toFixed(18));

          const bal = await provider.getBalance(wallet.address);
          if (bal < amountEthWei) {
            console.warn(`Insufficient ETH balance for ${uid}. Have: ${bal}, Need: ${amountEthWei}`);
            txHash = "failed";
            failReason = "INSUFFICIENT_ETH";
          } else {
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
        }
      }
    } catch (err: any) {
      console.error(`EVM Trade failed for ${uid}:`, safeErrMsg(err));
      txHash = "failed";
      failReason = "EVM_EXCEPTION";
    }
  }

  if (asset === "SOL") {
    attempted = true;
    try {
      const jupKey = requireJupiterKey();

      // 1) Derive solana keypair
      const pkHex = await deriveSolanaPrivKeyHex(uid);
      const seed = Uint8Array.from(Buffer.from(pkHex.slice(0, 64), "hex"));
      const keypair = Keypair.fromSeed(seed);
      const walletPubkey = keypair.publicKey.toString();

      console.log(`[SOL] Trading for ${uid} with wallet ${walletPubkey}`);

      // 2) Connection
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        "confirmed"
      );

      // 2.1) Fee check (prevents fee-payer issues)
      const feeBal = await connection.getBalance(keypair.publicKey);
      if (feeBal < 2_000_000) {
        // ~0.002 SOL
        txHash = "failed";
        failReason = "INSUFFICIENT_SOL_FOR_FEES";
        console.warn(`[SOL] Low SOL for fees for ${uid} (${walletPubkey}): ${feeBal} lamports`);
        await recordTradeHistorySafe({
          uid,
          action: signal,
          asset,
          signal,
          signalData,
          txHash,
          user,
          failReason,
        });
        return;
      }

      // 3) Direction + amount
      let inputMint: string;
      let outputMint: string;
      let amount: number;

      const price = Number(signalData.price);

      if (signal === "BUY") {
        inputMint = USDC_MINT_SOL;
        outputMint = SOL_MINT;
        amount = Math.floor(Number(user.maxTradeAmountUsdc) * 1e6);
      } else {
        inputMint = SOL_MINT;
        outputMint = USDC_MINT_SOL;

        if (!price || price <= 0) {
          txHash = "failed";
          failReason = "INVALID_PRICE";
          console.warn(`[SOL] Invalid price in signal for ${uid}:`, signalData.price);
          await recordTradeHistorySafe({
            uid,
            action: signal,
            asset,
            signal,
            signalData,
            txHash,
            user,
            failReason,
          });
          return;
        }

        const solAmount = Number(user.maxTradeAmountUsdc) / price;
        amount = Math.floor(solAmount * 1e9);
      }

      // 4) Quote
      console.log(`[SOL] Getting quote from Jupiter...`);
      const quoteRes = await axios.get(JUPITER_QUOTE_API, {
        timeout: 15000,
        headers: { "x-api-key": jupKey },
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: 100,
        },
      });

      const quoteData = quoteRes.data;

      if (!quoteData?.outAmount) {
        txHash = "failed";
        failReason = "INVALID_QUOTE";
        console.error(`[SOL] Invalid quote response for ${uid}`);
      } else {
        console.log(`[SOL] Quote received: ${amount} -> ${quoteData.outAmount}`);

        // 5) Build swap tx
        const swapRes = await axios.post(
          JUPITER_SWAP_API,
          {
            quoteResponse: quoteData,
            userPublicKey: walletPubkey,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
          },
          {
            timeout: 30000,
            headers: {
              "Content-Type": "application/json",
              "x-api-key": jupKey,
            },
          }
        );

        const swapTxBase64 = swapRes.data?.swapTransaction;

        if (!swapTxBase64) {
          txHash = "failed";
          failReason = "NO_SWAP_TX";
          console.error(`[SOL] No swap transaction returned for ${uid}`);
        } else {
          // 6) Deserialize + sign
          const swapTxBuf = Buffer.from(swapTxBase64, "base64");
          const transaction = VersionedTransaction.deserialize(swapTxBuf);
          transaction.sign([keypair]);

          // 7) Send
          console.log(`[SOL] Sending transaction...`);
          const signature = await connection.sendTransaction(transaction, {
            maxRetries: 3,
            skipPreflight: false,
          });

          console.log(`[SOL] TX Sent: ${signature}`);

          // 8) Confirm
          const confirmation = await connection.confirmTransaction(signature, "confirmed");
          if (confirmation.value.err) {
            txHash = "failed";
            failReason = "CONFIRM_ERR";
            console.error(`[SOL] TX failed for ${uid}:`, confirmation.value.err);
          } else {
            txHash = signature;
            console.log(`[SOL] TX Confirmed: ${signature}`);
          }
        }
      }
    } catch (err: any) {
      console.error(`[SOL] Trade failed for ${uid}:`, safeErrMsg(err));
      txHash = "failed";
      failReason = "SOL_EXCEPTION";
    }
  }

  if (!attempted) return;

  // Record Trade History (never throws)
  await recordTradeHistorySafe({
    uid,
    action: signal,
    asset,
    signal,
    signalData,
    txHash,
    user,
    failReason,
  });

  // Sapphire audit only on success
  if (txHash && txHash !== "failed") {
    try {
      await sapphireRecordAudit({
        uid,
        action: `TRADE_${signal}_${asset}`,
        txHash,
        meta: JSON.stringify({ price: signalData.price, amount: user.maxTradeAmountUsdc }),
      });
      console.log(`Audit log confirmed for ${uid}`);
    } catch (e: any) {
      console.warn("Audit log failed (non-critical):", safeErrMsg(e));
    }
  }
}

async function recordTradeHistorySafe(args: {
  uid: string;
  action: TradeAction;
  asset: "ETH" | "SOL";
  signal: TradeAction;
  signalData: any;
  txHash: string;
  user: any;
  failReason?: string;
}) {
  const { uid, action, asset, signal, signalData, txHash, user, failReason } = args;

  if (txHash === "") return;

  try {
    await TradeHistory.create({
      uid,
      action, // ALWAYS set (prevents validation crash)
      asset,
      signal,
      signalPrice: signalData?.price,
      chain: asset === "ETH" ? "base" : "solana",
      txHash,
      amountIn: String(user.maxTradeAmountUsdc),
      tokenIn: signal === "BUY" ? "USDC" : asset,
      status: txHash === "failed" ? "failed" : "success",
      // If your schema doesn't have `reason`, remove this line.
      ...(failReason ? { reason: failReason } : {}),
    });
  } catch (dbErr: any) {
    console.error(`[DB] TradeHistory write failed for ${uid}:`, safeErrMsg(dbErr));
  }
}
