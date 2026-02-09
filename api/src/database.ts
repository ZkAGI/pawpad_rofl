// import mongoose from "mongoose";
// import { CFG } from "./config.js";

// // --- Connection ---
// export async function connectToDatabase() {
//     try {
//         await mongoose.connect(CFG.mongoUri);
//         console.log("Connected to MongoDB at", CFG.mongoUri);
//     } catch (err) {
//         console.error("MongoDB connection error:", err);
//         // In TEE, failure to connect might be critical or retryable. 
//         // We won't exit process, just log.
//     }
// }

// // --- Schemas ---

// // 1. User Trading Configuration
// const userConfigSchema = new mongoose.Schema({
//     uid: { type: String, required: true, unique: true, index: true },

//     // Trading preferences
//     tradingEnabled: { type: Boolean, default: false },
//     maxTradeAmountUsdc: { type: Number, default: 100 }, // Max USDC amount per trade

//     // Whitelist / Constraints
//     allowedAssets: { type: [String], default: ["ETH", "SOL"] }, // Assets allowed to trade

//     // Auth (Encrypted Secret) - Stored here so user doesn't need to provide it on login
//     // In production, this field should be encrypted at rest if the DB is outside the TEE.
//     // Since we are running Mongo alongside API (or assuming secure environment), 
//     // we store it here. For max security, encrypt this field with a TEE-derived key before saving.
//     encryptedTotpSecret: { type: String, select: false }, // 'select: false' prevents accidental leak in queries

//     updatedAt: { type: Date, default: Date.now }
// });

// export const UserConfig = mongoose.model("UserConfig", userConfigSchema);

// // 2. Trade History (Executed Trades)
// const tradeHistorySchema = new mongoose.Schema({
//     uid: { type: String, required: true, index: true },

//     // Signal details
//     asset: { type: String, required: true }, // ETH or SOL
//     signal: { type: String, required: true }, // BUY, SELL, HOLD
//     signalPrice: { type: Number },

//     // Execution details
//     chain: { type: String, required: true }, // base, solana
//     txHash: { type: String, required: true },
//     amountIn: { type: String, required: true },
//     tokenIn: { type: String, required: true },
//     amountOut: { type: String }, // Estimated or confirmed
//     tokenOut: { type: String },

//     status: { type: String, enum: ["pending", "success", "failed"], default: "success" },
//     timestamp: { type: Date, default: Date.now },

//     // PnL tracking (simplified)
//     realizedPnl: { type: Number, default: 0 }
// });

// export const TradeHistory = mongoose.model("TradeHistory", tradeHistorySchema);

// // 3. Signal Log (for debugging/audit)
// const signalLogSchema = new mongoose.Schema({
//     asset: String,
//     payload: mongoose.Schema.Types.Mixed,
//     timestamp: { type: Date, default: Date.now }
// });

// export const SignalLog = mongoose.model("SignalLog", signalLogSchema);

import mongoose from "mongoose";
import { CFG } from "./config.js";

// --- Connection ---
export async function connectToDatabase() {
    try {
        await mongoose.connect(CFG.mongoUri);
        console.log("Connected to MongoDB at", CFG.mongoUri);
    } catch (err) {
        console.error("MongoDB connection error:", err);
        // In TEE, failure to connect might be critical or retryable. 
        // We won't exit process, just log.
    }
}

// --- Schemas ---

// 1. User Trading Configuration
const userConfigSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true, index: true },

    // Trading preferences
    tradingEnabled: { type: Boolean, default: false },
    maxTradeAmountUsdc: { type: Number, default: 100 }, // Max USDC amount per trade

    // Whitelist / Constraints
    allowedAssets: { type: [String], default: ["ETH", "SOL"] }, // Assets allowed to trade

    // Auth (Encrypted Secret) - Stored here so user doesn't need to provide it on login
    // In production, this field should be encrypted at rest if the DB is outside the TEE.
    // Since we are running Mongo alongside API (or assuming secure environment), 
    // we store it here. For max security, encrypt this field with a TEE-derived key before saving.
    encryptedTotpSecret: { type: String, select: false }, // 'select: false' prevents accidental leak in queries

    updatedAt: { type: Date, default: Date.now }
});

export const UserConfig = mongoose.model("UserConfig", userConfigSchema);

// 2. Trade History (Executed Trades & Withdrawals)
const tradeHistorySchema = new mongoose.Schema({
    uid: { type: String, required: true, index: true },

    // Action type - trade (BUY/SELL) or WITHDRAW
    action: { type: String, required: true }, // BUY, SELL, WITHDRAW

    // Asset being traded/withdrawn
    asset: { type: String, required: true }, // ETH, SOL, USDC

    // Signal details (optional - only for trades, not withdrawals)
    signal: { type: String }, // BUY, SELL, HOLD (from signal provider)
    signalPrice: { type: Number },

    // Execution details
    chain: { type: String, required: true }, // base, ethereum, solana
    txHash: { type: String, required: true },

    // Trade amounts (optional - for trades)
    amountIn: { type: String },
    tokenIn: { type: String },
    amountOut: { type: String },
    tokenOut: { type: String },

    // Withdrawal info (optional - for withdrawals)
    amount: { type: String }, // Withdrawal amount
    toAddress: { type: String }, // Withdrawal destination

    status: { type: String, enum: ["pending", "success", "failed"], default: "success" },
    timestamp: { type: Date, default: Date.now },

    // Extra metadata
    meta: { type: mongoose.Schema.Types.Mixed },

    // PnL tracking (simplified)
    realizedPnl: { type: Number, default: 0 }
});

export const TradeHistory = mongoose.model("TradeHistory", tradeHistorySchema);

// 3. Signal Log (for debugging/audit)
const signalLogSchema = new mongoose.Schema({
    asset: String,
    payload: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
});

export const SignalLog = mongoose.model("SignalLog", signalLogSchema);
