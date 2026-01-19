import { authenticator } from "otplib";
import { SignJWT, jwtVerify } from "jose";
import { CFG } from "./config.js";
import { deriveBytes32 } from "./keys.js";

export function newTotpSecret(): string {
  return authenticator.generateSecret();
}

export function otpauthUri(uid: string, secret: string): string {
  return authenticator.keyuri(`pawpad:${uid.slice(0, 8)}`, "PawPad", secret);
}

export function totpHash(secret: string): `0x${string}` {
  // keccak256 of UTF-8 secret (matches contract expectation)
  // We compute it in sapphire.ts using viem; keeping it simple here (string return not needed).
  // This file only verifies codes.
  return "0x" as any;
}

export function verifyTotp(code: string, secret: string): boolean {
  return authenticator.check(code, secret);
}

async function jwtKey(): Promise<Uint8Array> {
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

export async function requireJwt(authHeader: string | undefined): Promise<string> {
  const token = (authHeader || "").startsWith("Bearer ") ? (authHeader || "").slice(7) : "";
  if (!token) throw new Error("missing bearer token");
  const key = await jwtKey();
  const { payload } = await jwtVerify(token, key);
  if (typeof payload.uid !== "string") throw new Error("bad token");
  return payload.uid;
}

