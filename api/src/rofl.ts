import http from "node:http";
import { createHash } from "node:crypto";
import { CFG } from "./config.js";

export type KeyKind = "ed25519" | "secp256k1";

function unixPost(path: string, body: unknown): Promise<any> {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST",
        socketPath: CFG.roflSocket,
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(data.length)
        }
      },
      (res) => {
        let out = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (out += c));
        res.on("end", () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`rofl-appd ${res.statusCode}: ${out}`));
          }
          resolve(out ? JSON.parse(out) : {});
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Deterministic "key material" for local testing.
 * In ROFL mode, keys come from TEE via rofl-appd.
 */
export async function roflKeyHex(key_id: string, kind: KeyKind): Promise<string> {
  if (CFG.mockRofl) {
    // SHA256(dev_secret || key_id || kind) -> hex (64 chars)
    const h = createHash("sha256")
      .update(`${CFG.devMasterSecret}:${kind}:${key_id}`, "utf8")
      .digest("hex");
    return h; // 32 bytes hex
  }

  const r = await unixPost("/rofl/v1/keys/generate", { key_id, kind });
  const key: string = r.key;
  if (!key) throw new Error("rofl key empty");
  return key.startsWith("0x") ? key.slice(2) : key;
}

export async function roflTxSignSubmitEth(tx: {
  to: string;
  data: string;
  value?: string;
}): Promise<{ tx_hash: string }> {
  if (CFG.mockRofl) {
    // No real submission in mock mode
    return { tx_hash: "0xmock" };
  }

  const r = await unixPost("/rofl/v1/tx/sign-submit", {
    tx: {
      kind: "eth",
      to: tx.to,
      data: tx.data,
      value: tx.value || "0",
      gas: "0",
      gas_price: "0"
    }
  });

  return { tx_hash: r.tx_hash || r.hash || "" };
}
