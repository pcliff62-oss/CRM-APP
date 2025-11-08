import { z } from 'zod'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { config as dotenvConfig } from 'dotenv'

// Load env from .env.local in repo root and server folder if present
try {
  const rootEnv = path.resolve(process.cwd(), '..', '.env.local')
  if (existsSync(rootEnv)) dotenvConfig({ path: rootEnv })
} catch {}
try {
  const localEnv = path.resolve(process.cwd(), '.env.local')
  if (existsSync(localEnv)) dotenvConfig({ path: localEnv })
} catch {}

// Prefer explicit env vars; optionally allow GOOGLE_APPLICATION_CREDENTIALS pointing to a JSON file.
let fileCreds: any = {}
try {
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (gac && existsSync(gac)) {
    fileCreds = JSON.parse(readFileSync(path.resolve(gac), 'utf8'))
  }
} catch {}

const raw = {
  GCS_PROJECT_ID: process.env.GCS_PROJECT_ID || fileCreds.project_id,
  GCS_BUCKET: process.env.GCS_BUCKET || 'hytechcrm_app_storage',
  GCS_CLIENT_EMAIL: process.env.GCS_CLIENT_EMAIL || fileCreds.client_email,
  GCS_PRIVATE_KEY: process.env.GCS_PRIVATE_KEY || fileCreds.private_key,
  GCS_HMAC_ACCESS_KEY_ID: process.env.GCS_HMAC_ACCESS_KEY_ID,
  GCS_HMAC_SECRET_ACCESS_KEY: process.env.GCS_HMAC_SECRET_ACCESS_KEY,
  GCS_PUBLIC_BASE_URL: process.env.GCS_PUBLIC_BASE_URL,
}

const saSchema = z.object({
  GCS_PROJECT_ID: z.string().min(1),
  GCS_BUCKET: z.string().min(1),
  GCS_CLIENT_EMAIL: z.string().email(),
  GCS_PRIVATE_KEY: z.string().min(1),
})

const hmacSchema = z.object({
  GCS_PROJECT_ID: z.string().min(1),
  GCS_BUCKET: z.string().min(1),
  GCS_HMAC_ACCESS_KEY_ID: z.string().min(1),
  GCS_HMAC_SECRET_ACCESS_KEY: z.string().min(1),
})

const saParsed = saSchema.safeParse(raw)
const hmacParsed = hmacSchema.safeParse(raw)

export const USE_GCS = saParsed.success
export const USE_S3 = !USE_GCS && hmacParsed.success
export const USE_LOCAL = !USE_GCS && !USE_S3

export const env = USE_LOCAL
  ? {
      GCS_PROJECT_ID: 'local-dev',
      GCS_BUCKET: 'local-bucket',
      GCS_CLIENT_EMAIL: 'local@example.com',
      GCS_PRIVATE_KEY: 'local',
      GCS_HMAC_ACCESS_KEY_ID: '',
      GCS_HMAC_SECRET_ACCESS_KEY: '',
      GCS_PUBLIC_BASE_URL: '',
    }
  : USE_GCS
  ? {
      GCS_PROJECT_ID: (saParsed as any).data.GCS_PROJECT_ID,
      GCS_BUCKET: (saParsed as any).data.GCS_BUCKET,
      GCS_CLIENT_EMAIL: (saParsed as any).data.GCS_CLIENT_EMAIL,
      GCS_PRIVATE_KEY: (((saParsed as any).data.GCS_PRIVATE_KEY || '') as string).replace(/\\n/g, '\n'),
      GCS_HMAC_ACCESS_KEY_ID: raw.GCS_HMAC_ACCESS_KEY_ID || '',
      GCS_HMAC_SECRET_ACCESS_KEY: raw.GCS_HMAC_SECRET_ACCESS_KEY || '',
      GCS_PUBLIC_BASE_URL: raw.GCS_PUBLIC_BASE_URL || '',
    }
  : {
      GCS_PROJECT_ID: (hmacParsed as any).data.GCS_PROJECT_ID,
      GCS_BUCKET: (hmacParsed as any).data.GCS_BUCKET,
      GCS_CLIENT_EMAIL: '',
      GCS_PRIVATE_KEY: '',
      GCS_HMAC_ACCESS_KEY_ID: (hmacParsed as any).data.GCS_HMAC_ACCESS_KEY_ID,
      GCS_HMAC_SECRET_ACCESS_KEY: (hmacParsed as any).data.GCS_HMAC_SECRET_ACCESS_KEY,
      GCS_PUBLIC_BASE_URL: raw.GCS_PUBLIC_BASE_URL || '',
    }

export const GCS_BUCKET = env.GCS_BUCKET
