import crypto from "crypto";

// Base64URL helpers
function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export type JwtPayload = Record<string, any> & { exp?: number };

export function jwtSign(payload: JwtPayload, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function jwtVerify(token: string, secret: string): JwtPayload {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const [encHeader, encPayload, signature] = parts;
  const data = `${encHeader}.${encPayload}`;
  const expected = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  if (expected !== signature) throw new Error("Invalid signature");
  const payload = JSON.parse(Buffer.from(encPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  if (payload && typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) throw new Error("Token expired");
  }
  return payload;
}

export function getSignSecret() {
  return process.env.PROPOSAL_SIGN_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "dev-only-secret";
}
