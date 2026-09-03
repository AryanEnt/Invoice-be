import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { ServiceUnavailableError, ValidationError } from "../../lib/errors.js";
import { getR2BucketName, getR2Client, isR2Configured } from "./r2.client.js";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_CONTENT_TYPES = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

export type StoredObject = {
  key: string;
  body: Buffer;
  contentType?: string;
};

function assertR2Ready(): void {
  if (!isR2Configured()) {
    throw new ServiceUnavailableError(
      "File storage is not configured yet.",
      "R2_NOT_CONFIGURED",
    );
  }
}

export function isAllowedLogoContentType(contentType: string): boolean {
  return LOGO_CONTENT_TYPES.has(contentType.trim().toLowerCase());
}

export function logoExtensionForContentType(contentType: string): string {
  const ext = LOGO_CONTENT_TYPES.get(contentType.trim().toLowerCase());
  if (!ext) {
    throw new ValidationError("Logo must be a PNG, JPG, WebP, or SVG file");
  }
  return ext;
}

export function assertLogoUploadMeta(input: {
  contentType: string;
  contentLength: number;
}): void {
  if (!isAllowedLogoContentType(input.contentType)) {
    throw new ValidationError("Logo must be a PNG, JPG, WebP, or SVG file");
  }
  if (!Number.isFinite(input.contentLength) || input.contentLength <= 0) {
    throw new ValidationError("Logo file is empty");
  }
  if (input.contentLength > LOGO_MAX_BYTES) {
    throw new ValidationError("Logo must be 2MB or smaller");
  }
}

export function buildOrganizationLogoKey(
  organizationId: string,
  contentType: string,
): string {
  const ext = logoExtensionForContentType(contentType);
  return `organizations/${organizationId}/logo/${randomUUID()}.${ext}`;
}

export function buildInvoicePdfKey(invoiceId: string): string {
  return `invoices/${invoiceId}/invoice.pdf`;
}

export function isOrganizationLogoKey(organizationId: string, key: string): boolean {
  return key.startsWith(`organizations/${organizationId}/logo/`);
}

export function isInvoicePdfKey(invoiceId: string, key: string): boolean {
  return key === buildInvoicePdfKey(invoiceId);
}

export async function uploadObject(input: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  cacheControl?: string;
}): Promise<string> {
  assertR2Ready();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl,
    }),
  );
  return input.key;
}

export async function getObject(key: string): Promise<StoredObject | null> {
  assertR2Ready();
  try {
    const result = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
      }),
    );
    if (!result.Body) {
      return null;
    }
    const bytes = await result.Body.transformToByteArray();
    return {
      key,
      body: Buffer.from(bytes),
      contentType: result.ContentType ?? undefined,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NoSuchKey" || name === "NotFound") {
      return null;
    }
    throw error;
  }
}

export async function headObject(key: string): Promise<{
  contentType?: string;
  contentLength?: number;
} | null> {
  assertR2Ready();
  try {
    const result = await getR2Client().send(
      new HeadObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
      }),
    );
    return {
      contentType: result.ContentType ?? undefined,
      contentLength: result.ContentLength,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NoSuchKey" || name === "NotFound") {
      return null;
    }
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  assertR2Ready();
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
    }),
  );
}

export async function createPresignedUploadUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  assertR2Ready();
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: input.key,
    ContentType: input.contentType,
  });
  return getSignedUrl(getR2Client(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 5,
  });
}

export async function createPresignedDownloadUrl(input: {
  key: string;
  expiresInSeconds?: number;
  filename?: string;
}): Promise<string> {
  assertR2Ready();
  const command = new GetObjectCommand({
    Bucket: getR2BucketName(),
    Key: input.key,
    ...(input.filename
      ? {
          ResponseContentDisposition: `inline; filename="${input.filename.replace(/"/g, "")}"`,
        }
      : {}),
  });
  return getSignedUrl(getR2Client(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 15,
  });
}

export function contentTypeFromFilename(filename: string): string | null {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return null;
  }
}
