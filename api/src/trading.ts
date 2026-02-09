import axios from "axios";
import { UserConfig, TradeHistory, SignalLog } from "./database.js";
import { CFG } from "./config.js";
import { deriveEvmPrivKeyHex, deriveSolanaPrivKeyHex } from "./keys.js";
import { ethers, Wallet } from "ethers";
import { sapphireRecordAudit } from "./sapphire.js";
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";

// Standard ERC20 ABI (includes allowance)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
];

// --- CONSTANTS (BASE NETWORK) ---
const ROUTER_ADDRESS = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// Uniswap V2 Router ABI for getAmountsOut (quoting)
const ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
];

// --- CONSTANTS (SOLANA) ---
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap";

// =============================================================================
// TYPES & HELPERS
// =============================================================================

type TradeAction = "BUY" | "SELL" | "HOLD";

function normalizeAction(raw: any): TradeAction {
  const s = String(raw ?? "").toUpperCase();
  if (s === "BUY" || s === "SELL" || s === "HOLD") return s;
  return "HOLD";
}

function safeErrMsg(err: any): string {
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

function requireJupiterKey(): string {
  if (!JUPITER_API_KEY) {
    throw new Error("JUPITER_API_KEY is not set");
  }
  return JUPITER_API_KEY;
}

/**
 * Calculate minimum output with slippage protection
 */
function applySlippage(amount: bigint, slippageBps: number): bigint {
  // slippageBps of 100 = 1%, so multiplier is (10000 - 100) / 10000 = 0.99
  const multiplier = BigInt(10000 - slippageBps);
  return (amount * multiplier) / 10000n;
}

/**
 * Check if signal timestamp is fresh enough
 */
function isSignalFresh(signalData: any): boolean {
  if (!signalData?.timestamp) return false;
  const signalTime = new Date(signalData.timestamp).getTime();
  const now = Date.now();
  const ageMs = now - signalTime;
  return ageMs <= CFG.signalMaxAgeSeconds * 1000;
}

/**
 * Run tasks with limited concurrency
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
    });

    executing.push(p as Promise<void>);

    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises
      for (let i = executing.length - 1; i >= 0; i--) {
        // Check if promise is settled by racing with an immediate resolve
        const settled = await Promise.race([
          executing[i].then(() => true),
          Promise.resolve(false),
        ]);
        if (settled) {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

// =============================================================================
// SIGNAL FETCHING
// =============================================================================

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

// =============================================================================
// MAIN TRADING CYCLE
// =============================================================================

export async function runTradingCycle() {
  // ═══════════════════════════════════════════════════════════════════════════
  // EMERGENCY KILL SWITCH CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  if (CFG.tradingDisabled) {
    console.warn("⛔ TRADING DISABLED via kill switch. Skipping cycle.");
    return;
  }

  console.log("Starting trading cycle...");

  const signals = {
    ETH: await fetchSignal("ETH"),
    SOL: await fetchSignal("SOL"),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL STALENESS CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  if (signals.ETH && !isSignalFresh(signals.ETH)) {
    console.warn(`⚠️ ETH signal is stale (older than ${CFG.signalMaxAgeSeconds}s). Skipping.`);
    signals.ETH = null;
  }
  if (signals.SOL && !isSignalFresh(signals.SOL)) {
    console.warn(`⚠️ SOL signal is stale (older than ${CFG.signalMaxAgeSeconds}s). Skipping.`);
    signals.SOL = null;
  }

  const users = await UserConfig.find({ tradingEnabled: true });

  if (users.length === 0) {
    console.log("No users with trading enabled.");
    return;
  }

  console.log(`Processing ${users.length} users with concurrency ${CFG.tradingConcurrency}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLEL PROCESSING WITH CONCURRENCY LIMIT
  // ═══════════════════════════════════════════════════════════════════════════
  const tasks = users.map((user) => async () => {
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
  });

  await runWithConcurrency(tasks, CFG.tradingConcurrency);
  console.log("Trading cycle complete.");
}

// =============================================================================
// PROCESS INDIVIDUAL USER TRADE
// =============================================================================

async function processUserTrade(user: any, asset: "ETH" | "SOL", signalData: any) {
  const uid = user.uid;
  const signal: TradeAction = normalizeAction(signalData?.signal);

  if (signal === "HOLD") return;

  console.log(
    `Executing ${signal} on ${asset} for ${uid} (Price: ${signalData.price})`
  );

  let txHash = "";
  let attempted = false;
  let failReason = "";

  // ═══════════════════════════════════════════════════════════════════════════
  // EVM TRADING (BASE NETWORK)
  // ═══════════════════════════════════════════════════════════════════════════
  if (asset === "ETH") {
    attempted = true;
    try {
      const pk = await deriveEvmPrivKeyHex(uid);
      const provider = new ethers.JsonRpcProvider(
        process.env.BASE_RPC_URL || "https://mainnet.base.org"
      );
      const wallet = new Wallet(pk, provider);

      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

      if (signal === "BUY") {
        // BUY: USDC -> ETH
        const amountIn = ethers.parseUnits(String(user.maxTradeAmountUsdc), 6);

        // Check balance
        const balance = await usdcContract.balanceOf(wallet.address);
        if (balance < amountIn) {
          console.warn(
            `Insufficient USDC balance for ${uid}. Have: ${ethers.formatUnits(balance, 6)}, Need: ${user.maxTradeAmountUsdc}`
          );
          txHash = "failed";
          failReason = "INSUFFICIENT_USDC";
        } else {
          // ═══════════════════════════════════════════════════════════════════
          // SMART ALLOWANCE: Check before approving
          // ═══════════════════════════════════════════════════════════════════
          const currentAllowance = await usdcContract.allowance(wallet.address, ROUTER_ADDRESS);
          if (currentAllowance < amountIn) {
            console.log(`Approving USDC for ${uid}...`);
            const approveTx = await usdcContract.approve(ROUTER_ADDRESS, amountIn);
            await approveTx.wait();
          } else {
            console.log(`Sufficient allowance exists for ${uid}, skipping approve.`);
          }

          // ═══════════════════════════════════════════════════════════════════
          // SLIPPAGE PROTECTION: Get quote first
          // ═══════════════════════════════════════════════════════════════════
          const path = [USDC_ADDRESS, WETH_ADDRESS];
          const amounts = await router.getAmountsOut(amountIn, path);
          const expectedOut = amounts[1]; // WETH amount
          const amountOutMin = applySlippage(expectedOut, CFG.maxSlippageBps);

          console.log(
            `[EVM BUY] Quote: ${ethers.formatUnits(amountIn, 6)} USDC -> ${ethers.formatEther(expectedOut)} ETH (min: ${ethers.formatEther(amountOutMin)})`
          );

          // ═══════════════════════════════════════════════════════════════════
          // PRICE SANITY CHECK
          // ═══════════════════════════════════════════════════════════════════
          const quotedPriceUsd = Number(user.maxTradeAmountUsdc) / Number(ethers.formatEther(expectedOut));
          const signalPrice = Number(signalData.price);
          const deviation = Math.abs(quotedPriceUsd - signalPrice) / signalPrice * 100;

          if (deviation > CFG.maxPriceDeviationPercent) {
            console.warn(
              `[EVM] Price deviation too high for ${uid}: quoted $${quotedPriceUsd.toFixed(2)} vs signal $${signalPrice} (${deviation.toFixed(1)}%)`
            );
            txHash = "failed";
            failReason = "PRICE_DEVIATION_TOO_HIGH";
          } else {
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
            const tx = await router.swapExactTokensForETH(
              amountIn,
              amountOutMin,
              path,
              wallet.address,
              deadline
            );

            console.log(`[EVM] Buy TX Sent: ${tx.hash}`);
            const receipt = await tx.wait();
            txHash = receipt.hash;
          }
        }
      } else if (signal === "SELL") {
        // SELL: ETH -> USDC
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
            // ═══════════════════════════════════════════════════════════════════
            // SLIPPAGE PROTECTION: Get quote first
            // ═══════════════════════════════════════════════════════════════════
            const path = [WETH_ADDRESS, USDC_ADDRESS];
            const amounts = await router.getAmountsOut(amountEthWei, path);
            const expectedOut = amounts[1]; // USDC amount
            const amountOutMin = applySlippage(expectedOut, CFG.maxSlippageBps);

            console.log(
              `[EVM SELL] Quote: ${ethers.formatEther(amountEthWei)} ETH -> ${ethers.formatUnits(expectedOut, 6)} USDC (min: ${ethers.formatUnits(amountOutMin, 6)})`
            );

            // ═══════════════════════════════════════════════════════════════════
            // PRICE SANITY CHECK
            // ═══════════════════════════════════════════════════════════════════
            const quotedPriceUsd = Number(ethers.formatUnits(expectedOut, 6)) / amountEthFloat;
            const signalPrice = Number(signalData.price);
            const deviation = Math.abs(quotedPriceUsd - signalPrice) / signalPrice * 100;

            if (deviation > CFG.maxPriceDeviationPercent) {
              console.warn(
                `[EVM] Price deviation too high for ${uid}: quoted $${quotedPriceUsd.toFixed(2)} vs signal $${signalPrice} (${deviation.toFixed(1)}%)`
              );
              txHash = "failed";
              failReason = "PRICE_DEVIATION_TOO_HIGH";
            } else {
              const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
              const tx = await router.swapExactETHForTokens(
                amountOutMin,
                path,
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
      }
    } catch (err: any) {
      console.error(`EVM Trade failed for ${uid}:`, safeErrMsg(err));
      txHash = "failed";
      failReason = "EVM_EXCEPTION";
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOLANA TRADING (JUPITER)
  // ═══════════════════════════════════════════════════════════════════════════
  if (asset === "SOL") {
    attempted = true;
    try {
      const jupKey = requireJupiterKey();

      const pkHex = await deriveSolanaPrivKeyHex(uid);
      const seed = Uint8Array.from(Buffer.from(pkHex.slice(0, 64), "hex"));
      const keypair = Keypair.fromSeed(seed);
      const walletPubkey = keypair.publicKey.toString();

      console.log(`[SOL] Trading for ${uid} with wallet ${walletPubkey}`);

      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        "confirmed"
      );

      // Fee check
      const feeBal = await connection.getBalance(keypair.publicKey);
      if (feeBal < 2_000_000) {
        txHash = "failed";
        failReason = "INSUFFICIENT_SOL_FOR_FEES";
        console.warn(`[SOL] Low SOL for fees for ${uid}: ${feeBal} lamports`);
        await recordTradeHistorySafe({
          uid, action: signal, asset, signal, signalData, txHash, user, failReason,
        });
        return;
      }

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
            uid, action: signal, asset, signal, signalData, txHash, user, failReason,
          });
          return;
        }

        const solAmount = Number(user.maxTradeAmountUsdc) / price;
        amount = Math.floor(solAmount * 1e9);
      }

      // Get quote with slippage from config
      console.log(`[SOL] Getting quote from Jupiter...`);
      const quoteRes = await axios.get(JUPITER_QUOTE_API, {
        timeout: 15000,
        headers: { "x-api-key": jupKey },
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: CFG.maxSlippageBps,
        },
      });

      const quoteData = quoteRes.data;

      if (!quoteData?.outAmount) {
        txHash = "failed";
        failReason = "INVALID_QUOTE";
        console.error(`[SOL] Invalid quote response for ${uid}`);
      } else {
        console.log(`[SOL] Quote received: ${amount} -> ${quoteData.outAmount}`);

        // ═══════════════════════════════════════════════════════════════════
        // PRICE SANITY CHECK FOR SOLANA
        // ═══════════════════════════════════════════════════════════════════
        let quotedPrice: number;
        if (signal === "BUY") {
          // USDC -> SOL: price = USDC amount / SOL amount
          quotedPrice = (amount / 1e6) / (Number(quoteData.outAmount) / 1e9);
        } else {
          // SOL -> USDC: price = USDC amount / SOL amount
          quotedPrice = (Number(quoteData.outAmount) / 1e6) / (amount / 1e9);
        }

        const deviation = Math.abs(quotedPrice - price) / price * 100;

        if (deviation > CFG.maxPriceDeviationPercent) {
          console.warn(
            `[SOL] Price deviation too high for ${uid}: quoted $${quotedPrice.toFixed(2)} vs signal $${price} (${deviation.toFixed(1)}%)`
          );
          txHash = "failed";
          failReason = "PRICE_DEVIATION_TOO_HIGH";
        } else {
          // Build swap tx
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
            const swapTxBuf = Buffer.from(swapTxBase64, "base64");
            const transaction = VersionedTransaction.deserialize(swapTxBuf);
            transaction.sign([keypair]);

            console.log(`[SOL] Sending transaction...`);
            const signature = await connection.sendTransaction(transaction, {
              maxRetries: 3,
              skipPreflight: false,
            });

            console.log(`[SOL] TX Sent: ${signature}`);

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
      }
    } catch (err: any) {
      console.error(`[SOL] Trade failed for ${uid}:`, safeErrMsg(err));
      txHash = "failed";
      failReason = "SOL_EXCEPTION";
    }
  }

  if (!attempted) return;

  // Record Trade History
  await recordTradeHistorySafe({
    uid, action: signal, asset, signal, signalData, txHash, user, failReason,
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

// =============================================================================
// DATABASE HELPER
// =============================================================================

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
      action,
      asset,
      signal,
      signalPrice: signalData?.price,
      chain: asset === "ETH" ? "base" : "solana",
      txHash,
      amountIn: String(user.maxTradeAmountUsdc),
      tokenIn: signal === "BUY" ? "USDC" : asset,
      status: txHash === "failed" ? "failed" : "success",
      ...(failReason ? { reason: failReason } : {}),
    });
  } catch (dbErr: any) {
    console.error(`[DB] TradeHistory write failed for ${uid}:`, safeErrMsg(dbErr));
  }
}
