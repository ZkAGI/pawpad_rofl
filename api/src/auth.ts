import { authenticator } from "otplib";
import { SignJWT, jwtVerify } from "jose";
import { deriveBytes32 } from "./keys.js";
import { CFG } from "./config.js";

export function newTotpSecret(): string {
  return authenticator.generateSecret();
}

export function otpauthUri(uid: string, secret: string): string {
  return authenticator.keyuri(`pawpad:${uid.slice(0, 8)}`, "PawPad", secret);
}

export function checkTotp(code: string, secret: string): boolean {
  return authenticator.check(code, secret);
}

async function jwtKey(): Promise<Uint8Array> {
  // TEE derived in ROFL mode; deterministic in mock mode
  const k = await deriveBytes32("pawpad:master:jwt:v1");
  return new Uint8Array(k);
}

export async function issueJwt(uid: string): Promise<string> {
  const key = await jwtKey();
  return await new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CFG.jwtTtlMinutes}m`)
    .sign(key);
}

export async function requireJwt(authHeader?: string): Promise<string> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("missing bearer token");

  const key = await jwtKey();
  const { payload } = await jwtVerify(token, key);
  if (typeof payload.uid !== "string") throw new Error("invalid token");
  return payload.uid;
}
