import { SignJWT, importPKCS8 } from "jose";
import { promises as fs } from "fs";

// Generate MapKit JS token (JWT) for Apple Maps JS SDK.
// Env: MAPKIT_TEAM_ID, MAPKIT_KEY_ID, MAPKIT_PRIVATE_KEY or MAPKIT_PRIVATE_KEY_FILE
// Optional: MAPKIT_MAPS_ID (used as subject), MAPKIT_ALLOWED_ORIGINS (comma list)
export async function getMapkitToken(rawOrigin: string | null | undefined) {
  try {
    const teamId = process.env.MAPKIT_TEAM_ID;
    const keyId = process.env.MAPKIT_KEY_ID;
    const mapsId = process.env.MAPKIT_MAPS_ID; // e.g. TEAMID.maps.identifier
    let pk = (process.env.MAPKIT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    const keyFile = process.env.MAPKIT_PRIVATE_KEY_FILE;
    if (keyFile) {
      try { pk = await fs.readFile(keyFile, "utf8"); } catch {}
    }
    if (!teamId || !keyId || !pk) return null;

    // If user provided raw base64 (no BEGIN line), wrap it as PKCS#8 PEM.
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pk)) {
      const raw = pk.trim().replace(/\s+/g, "");
      if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
        pk = `-----BEGIN PRIVATE KEY-----\n${raw}\n-----END PRIVATE KEY-----`;
      }
    }

    // Derive allowed origins: explicit list > provided origin > localhost default.
    let origins: string[] = [];
    const list = process.env.MAPKIT_ALLOWED_ORIGINS;
    if (list) origins = list.split(/[,\s]+/).filter(Boolean);
    else if (rawOrigin) origins = [rawOrigin];
    else origins = ["http://localhost:3000", "http://localhost:3001"]; // dev defaults

    // Sanitize each origin: keep only scheme://host[:port]
    origins = origins.map(o => {
      try {
        const u = new URL(o);
        return `${u.protocol}//${u.host}`;
      } catch { return o; }
    });
    // Deduplicate
    origins = Array.from(new Set(origins));

    const alg = "ES256";
    const key = await importPKCS8(pk, alg);
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60; // 1 hour
    const payload: Record<string, any> = { origin: origins }; // origin array
    if (mapsId) payload.sub = mapsId; // subject claim (Maps ID)

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg, kid: keyId, typ: "JWT" })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(key);
    return token;
  } catch (err) {
    console.error("MapKit token generation failed", err);
    throw err; // let route decide how to surface
  }
}
