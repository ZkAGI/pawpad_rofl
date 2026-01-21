// import { CFG } from "./config.js";
// import fs from "node:fs";

// export function assertRoflReady() {
//   if (CFG.mockRofl) return;
//   if (!CFG.roflSocket) throw new Error("ROFL_APPD_SOCKET missing");
//   if (!fs.existsSync(CFG.roflSocket)) {
//     throw new Error(`rofl-appd socket not found at ${CFG.roflSocket}`);
//   }
// }

import { CFG } from "./config.js";
import { roflAppId } from "./rofl.js";

export async function roflStatus() {
  if (CFG.mockRofl) {
    return { ok: true, mode: "mock", rofl_socket: CFG.roflSocket };
  }
  const id = await roflAppId();
  return { ok: true, mode: "rofl", app_id: id, rofl_socket: CFG.roflSocket };
}
