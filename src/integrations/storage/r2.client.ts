import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { corsOrigins, env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

let client: S3Client | null = null;
let corsSync: Promise<void> | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME &&
      env.R2_ENDPOINT,
  );
}

export function getR2BucketName(): string {
  if (!env.R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME is not configured");
  }
  return env.R2_BUCKET_NAME;
}

export function getR2Client(): S3Client {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 is not configured");
  }

  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
      // AWS SDK v3 signs CRC32 checksums by default. Browser PUTs to presigned
      // URLs cannot satisfy those headers, which shows up as a fetch/CORS error.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    corsSync ??= syncR2Cors(client).catch((error) => {
      logger.warn("Unable to apply R2 CORS rules", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return client;
}

async function syncR2Cors(s3: S3Client): Promise<void> {
  const origins = [...new Set([...corsOrigins, env.APP_URL].filter(Boolean))] as string[];
  if (origins.length === 0) {
    return;
  }

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: getR2BucketName(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "etag", "x-amz-request-id"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}
