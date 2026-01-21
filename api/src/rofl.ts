
// import http from "node:http";
// import { CFG } from "./config.js";

// export type KeyKind = "raw-256" | "raw-384" | "ed25519" | "secp256k1";

// function unixRequest(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
//   const data = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), "utf8");

//   return new Promise((resolve, reject) => {
//     const req = http.request(
//       {
//         method,
//         socketPath: CFG.roflSocket,
//         path,
//         headers:
//           body === undefined
//             ? {
//                 // ✅ Required for Rocket in rofl-appd; prevents HTML 422.
//                 Host: "localhost",
//                 Accept: "application/json",
//               }
//             : {
//                 // ✅ Required for Rocket in rofl-appd; prevents HTML 422.
//                 Host: "localhost",
//                 Accept: "application/json",
//                 "Content-Type": "application/json",
//                 "Content-Length": String(data.length),
//               },
//       },
//       (res) => {
//         let out = "";
//         res.setEncoding("utf8");
//         res.on("data", (c) => (out += c));
//         res.on("end", () => {
//           const code = res.statusCode ?? 0;
//           if (code < 200 || code >= 300) {
//             const preview = out.slice(0, 500).replace(/\s+/g, " ");
//             return reject(new Error(`rofl-appd ${code}: ${preview}`));
//           }

//           // app/id returns plain string; others return JSON
//           try {
//             resolve(JSON.parse(out));
//           } catch {
//             resolve(out);
//           }
//         });
//       }
//     );

//     req.on("error", reject);
//     if (body !== undefined) req.write(data);
//     req.end();
//   });
// }

// export async function roflAppId(): Promise<string> {
//   const r = await unixRequest("GET", "/rofl/v1/app/id");
//   if (typeof r !== "string") throw new Error(`unexpected app id response: ${JSON.stringify(r)}`);
//   return r.trim();
// }

// /**
//  * Official doc:
//  * POST /rofl/v1/keys/generate
//  * body = { key_id: string, kind: "secp256k1" | "ed25519" | ... }
//  * returns { key: "<hex>" }
//  */
// export async function roflKeyGenerate(key_id: string, kind: KeyKind): Promise<string> {
//   const r = await unixRequest("POST", "/rofl/v1/keys/generate", { key_id, kind });
//   const key: string | undefined = r?.key;
//   if (!key || typeof key !== "string") throw new Error(`rofl key missing: ${JSON.stringify(r)}`);
//   return key.startsWith("0x") ? key.slice(2) : key;
// }

// /**
//  * Official doc:
//  * POST /rofl/v1/tx/sign-submit
//  * { encrypt: true, tx: { kind: "eth", data: { gas_limit, to, value, data } } }
//  */
// export async function roflTxSignSubmit(payload: unknown): Promise<any> {
//   return await unixRequest("POST", "/rofl/v1/tx/sign-submit", payload);
// }



import http from "node:http";
import { CFG } from "./config.js";

export type KeyKind = "raw-256" | "raw-384" | "ed25519" | "secp256k1";

function unixRequest(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const data = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), "utf8");
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        socketPath: CFG.roflSocket,
        path,
        headers:
          body === undefined
            ? {
                // ✅ Required for Rocket in rofl-appd; prevents HTML 422.
                Host: "localhost",
                Accept: "application/json",
              }
            : {
                // ✅ Required for Rocket in rofl-appd; prevents HTML 422.
                Host: "localhost",
                Accept: "application/json",
                "Content-Type": "application/json",
                "Content-Length": String(data.length),
              },
      },
      (res) => {
        let out = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (out += c));
        res.on("end", () => {
          const code = res.statusCode ?? 0;
          if (code < 200 || code >= 300) {
            const preview = out.slice(0, 500).replace(/\s+/g, " ");
            return reject(new Error(`rofl-appd ${code}: ${preview}`));
          }
          // app/id returns plain string; others return JSON
          try {
            resolve(JSON.parse(out));
          } catch {
            resolve(out);
          }
        });
      }
    );
    req.on("error", reject);
    if (body !== undefined) req.write(data);
    req.end();
  });
}

export async function roflAppId(): Promise<string> {
  const r = await unixRequest("GET", "/rofl/v1/app/id");
  if (typeof r !== "string") throw new Error(`unexpected app id response: ${JSON.stringify(r)}`);
  return r.trim();
}

/**
 * Official doc:
 * POST /rofl/v1/keys/generate
 * body = { key_id: string, kind: "secp256k1" | "ed25519" | ... }
 * returns { key: "<hex>" }
 * 
 * Keys are derived deterministically from key_id - calling with same key_id
 * always returns the same key.
 */
export async function roflKeyGenerate(key_id: string, kind: KeyKind): Promise<string> {
  const r = await unixRequest("POST", "/rofl/v1/keys/generate", { key_id, kind });
  const key: string | undefined = r?.key;
  if (!key || typeof key !== "string") throw new Error(`rofl key missing: ${JSON.stringify(r)}`);
  // Return with 0x prefix for ethers.js compatibility
  return key.startsWith("0x") ? key : `0x${key}`;
}

/**
 * POST /rofl/v1/tx/sign-submit
 * 
 * NOTE: This endpoint is designed for Oasis-native Sapphire transactions.
 * For EVM contract calls, it's recommended to use ethers.js with a key
 * generated via roflKeyGenerate() instead - see sapphire.ts
 */
export async function roflTxSignSubmit(payload: unknown): Promise<any> {
  return await unixRequest("POST", "/rofl/v1/tx/sign-submit", payload);
}
