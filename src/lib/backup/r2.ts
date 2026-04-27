import crypto from "node:crypto";

/**
 * Cloudflare R2 / S3 互換 PutObject を依存追加なしで叩く最小実装。
 *
 * AWS SDK を入れたくない理由:
 *   - portal の依存を増やしたくない (Phase A3 ではバックアップ以外で S3 SDK は使わない)
 *   - Edge runtime ではなく Node runtime 専用なので fetch + crypto で署名すれば足りる
 *
 * env:
 *   R2_BACKUP_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
 *   R2_BACKUP_BUCKET=boundary-backups
 *   R2_BACKUP_ACCESS_KEY_ID=...
 *   R2_BACKUP_SECRET_ACCESS_KEY=...
 *   R2_BACKUP_REGION=auto
 *
 * 既存の `boundary-assets` バケットとは別キーペアで用意することを推奨。
 * （バックアップ専用のオブジェクト R&W トークンを作成しておく）
 */

type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

function readConfig(): R2Config | null {
  const endpoint = process.env.R2_BACKUP_ENDPOINT;
  const bucket = process.env.R2_BACKUP_BUCKET;
  const accessKeyId = process.env.R2_BACKUP_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_BACKUP_SECRET_ACCESS_KEY;
  const region = process.env.R2_BACKUP_REGION ?? "auto";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

export type BackupArtifact = {
  /** バケット内 key (prefix も含む)。例: boundary-backups/supabase/20260428/profiles.jsonl */
  key: string;
  contentType: string;
  body: Buffer;
};

function hex(buf: Buffer): string {
  return buf.toString("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function awsSignV4(opts: {
  config: R2Config;
  method: string;
  path: string;
  query: string;
  body: Buffer;
  contentType: string;
  now: Date;
}): { url: string; headers: Record<string, string> } {
  const { config, method, path, query, body, contentType, now } = opts;
  const service = "s3";
  const host = new URL(config.endpoint).host;
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .replace(/Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(body);

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    `content-type:${contentType}`,
  ];
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  // canonical headers must be sorted by lowercased name
  canonicalHeaders.sort();

  const canonicalRequest = [
    method,
    path,
    query,
    canonicalHeaders.join("\n"),
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hex(hmac(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `${config.endpoint}${path}${query ? `?${query}` : ""}`;
  return {
    url,
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  };
}

export async function uploadBackupArtifact(
  artifact: BackupArtifact,
): Promise<{ uploaded: boolean; bucket: string; key: string; bytes: number }> {
  const config = readConfig();
  if (!config) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[backup-r2] R2_BACKUP_* env 未設定のため upload skip", {
        key: artifact.key,
      });
    }
    return {
      uploaded: false,
      bucket: "",
      key: artifact.key,
      bytes: artifact.body.byteLength,
    };
  }

  const path = `/${config.bucket}/${artifact.key}`;
  const signed = awsSignV4({
    config,
    method: "PUT",
    path,
    query: "",
    body: artifact.body,
    contentType: artifact.contentType,
    now: new Date(),
  });

  const res = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body: new Uint8Array(artifact.body),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`R2 PUT ${res.status}: ${body.slice(0, 200)}`);
  }
  return {
    uploaded: true,
    bucket: config.bucket,
    key: artifact.key,
    bytes: artifact.body.byteLength,
  };
}
