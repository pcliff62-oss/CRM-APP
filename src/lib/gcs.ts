import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

export function getGcs() {
  if (storage) return storage;
  const projectId = process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const clientEmail = process.env.GCS_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || undefined;
  const privateKey = (process.env.GCS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n") || undefined;

  if (clientEmail && privateKey) {
    storage = new Storage({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
  } else {
    // Fallback to ADC if set (GOOGLE_APPLICATION_CREDENTIALS)
    storage = new Storage({ projectId });
  }
  return storage;
}

export function gcsPublicUrl(bucket: string, objectKey: string, baseUrl?: string) {
  if (baseUrl) return `${baseUrl.replace(/\/$/, "")}/${objectKey}`;
  return `https://storage.googleapis.com/${bucket}/${objectKey}`;
}

export async function gcsGetSignedUrl(bucket: string, objectKey: string, expiresInSeconds = 3600) {
  const [url] = await getGcs().bucket(bucket).file(objectKey).getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInSeconds * 1000,
  });
  return url as string;
}

export function parseGcsKeyFromUrlOrPath(filePath: string, bucket: string, baseUrl?: string): string | null {
  const marker = `/${bucket}/`;
  if (filePath.includes(marker)) return filePath.split(marker)[1];
  if (baseUrl && filePath.startsWith(baseUrl)) return filePath.substring(baseUrl.replace(/\/$/, '').length + 1);
  return null;
}
