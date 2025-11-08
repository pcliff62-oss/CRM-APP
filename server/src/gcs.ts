import { Storage } from '@google-cloud/storage'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, _Object } from '@aws-sdk/client-s3'
import { env, USE_LOCAL, USE_S3 } from './env'

export const storage = USE_LOCAL || USE_S3
  ? ({} as any)
  : new Storage({ projectId: env.GCS_PROJECT_ID, credentials: { client_email: env.GCS_CLIENT_EMAIL, private_key: env.GCS_PRIVATE_KEY } })

const s3 = USE_S3
  ? new S3Client({
      region: 'auto',
      endpoint: 'https://storage.googleapis.com',
      credentials: {
        accessKeyId: env.GCS_HMAC_ACCESS_KEY_ID as string,
        secretAccessKey: env.GCS_HMAC_SECRET_ACCESS_KEY as string,
      },
    })
  : ({} as any)

export const bucket = USE_LOCAL
  ? ({
      _files: new Map<string, Buffer>(),
      file(name: string) {
        const self = this as any
        return {
          name,
          async save(buf: Buffer) { self._files.set(name, Buffer.from(buf)) },
          async download() { const b = self._files.get(name) || Buffer.from('{"items":[]}'); return [b] },
          async delete() { self._files.delete(name) },
          async getMetadata() { return [{ generation: 1 }] as any },
        }
      },
      async getFiles({ prefix }: any) {
        const allKeys = Array.from((this as any)._files.keys()) as string[]
        const keys = allKeys.filter((k: string) => k.startsWith(prefix || ''))
        const files = keys.map((k: string) => ({ name: k, metadata: { size: String(((this as any)._files.get(k)?.length || 0)), updated: new Date().toISOString() } }))
        return [files] as any
      }
    } as any)
  : USE_S3
  ? ({
      async file(name: string) {
        return {
          name,
          async save(buf: Buffer, _opts?: any) {
            await s3.send(new PutObjectCommand({ Bucket: env.GCS_BUCKET, Key: name, Body: buf }))
          },
          async download() {
            const out: any = await s3.send(new GetObjectCommand({ Bucket: env.GCS_BUCKET, Key: name }))
            const body = Buffer.from(await out.Body.transformToByteArray())
            return [body]
          },
          async delete() {
            await s3.send(new DeleteObjectCommand({ Bucket: env.GCS_BUCKET, Key: name }))
          },
          async getMetadata() { return [{ generation: Date.now() }] as any },
        }
      },
      async getFiles({ prefix }: any) {
        const out = await s3.send(new ListObjectsV2Command({ Bucket: env.GCS_BUCKET, Prefix: prefix || '' }))
        const files = (out.Contents || []).map((it: _Object) => ({ name: it.Key!, metadata: { size: String(it.Size||0), updated: (it.LastModified||new Date()).toISOString() } }))
        return [files] as any
      },
    } as any)
  : storage.bucket(env.GCS_BUCKET)

export function sanitizeKey(key: string) {
  key = key.replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  if (key.includes('..')) throw Object.assign(new Error('Bad key'), { code: 'BadKey' })
  return key
}

export async function putObject(key: string, buf: Buffer, contentType?: string) {
  key = sanitizeKey(key)
  if (USE_S3) {
    await (s3 as any).send(new PutObjectCommand({ Bucket: env.GCS_BUCKET, Key: key, Body: buf, ContentType: contentType }))
  } else {
    const f = bucket.file(key)
    await f.save(buf, { contentType, resumable: false, validation: 'md5' })
  }
  return { key }
}

export async function getSignedUrl(key: string, expiresInSeconds = 3600) {
  key = sanitizeKey(key)
  if (USE_S3) {
    // No native sign in this simple shim; fall back to public base or unsigned public URL
    const base = env.GCS_PUBLIC_BASE_URL || `https://storage.googleapis.com/${env.GCS_BUCKET}`
    return `${base}/${encodeURI(key)}`
  } else {
    const f = bucket.file(key)
    const [url] = await f.getSignedUrl({ action: 'read', expires: Date.now() + expiresInSeconds * 1000 })
    return url
  }
}

export async function listObjects(prefix = 'iphone/') {
  const [files] = await (bucket as any).getFiles({ prefix })
  return (files as any[]).map((f: any) => ({ key: f.name, size: Number(f.metadata.size || 0), updated: f.metadata.updated }))
}

export async function deleteObject(key: string) {
  key = sanitizeKey(key)
  if (USE_S3) {
    await (s3 as any).send(new DeleteObjectCommand({ Bucket: env.GCS_BUCKET, Key: key }))
  } else {
    await bucket.file(key).delete({ ignoreNotFound: true })
  }
}
