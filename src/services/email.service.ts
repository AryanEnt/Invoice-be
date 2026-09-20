import { Resend } from "resend";
import { env } from "../config/env.js";
import { ServiceUnavailableError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { withTimeout } from "../lib/timeout.js";

export type EmailAttachmentInput = {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachmentInput[];
};

export type SendEmailResult = {
  sent: true;
  provider: "resend";
  id?: string;
};

let resendClient: Resend | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && resolveFromAddress());
}

export function resolveFromAddress(): string | null {
  const from = env.EMAIL_FROM?.trim();
  if (!from) {
    return null;
  }
  if (from.includes("<") && from.includes(">")) {
    return from;
  }
  const name = env.EMAIL_FROM_NAME?.trim() || "Invoice";
  return `${name} <${from}>`;
}

function getResendClient(): Resend {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new ServiceUnavailableError(
      "Email sending is not configured yet.",
      "EMAIL_NOT_CONFIGURED",
    );
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/** Test helper — clears cached Resend client between tests. */
export function clearResendClientCache(): void {
  resendClient = null;
}

function mapResendError(error: unknown): ServiceUnavailableError {
  const message = error instanceof Error ? error.message : "Unknown email error";
  const normalized = message.toLowerCase();

  if (normalized.includes("api key") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return new ServiceUnavailableError(
      "Email provider authentication failed. Check RESEND_API_KEY.",
      "EMAIL_SEND_FAILED",
    );
  }

  if (
    normalized.includes("invalid") &&
    (normalized.includes("from") || normalized.includes("sender") || normalized.includes("email_from"))
  ) {
    return new ServiceUnavailableError(
      "Email sender address is invalid. Check EMAIL_FROM.",
      "EMAIL_SEND_FAILED",
    );
  }

  if (
    normalized.includes("recipient") ||
    normalized.includes("invalid `to`") ||
    normalized.includes("invalid to") ||
    normalized.includes("mailbox")
  ) {
    return new ServiceUnavailableError(
      "The recipient email address was rejected by the email provider.",
      "EMAIL_SEND_FAILED",
    );
  }

  if (normalized.includes("attachment")) {
    return new ServiceUnavailableError(
      "Email attachment could not be sent. Please try again later.",
      "EMAIL_SEND_FAILED",
    );
  }

  return new ServiceUnavailableError(
    env.NODE_ENV === "production"
      ? "We couldn't send this email right now. Please try again later."
      : message.slice(0, 500),
    "EMAIL_SEND_FAILED",
  );
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "[redacted]";
  }
  const visible = local.length <= 2 ? "*" : `${local[0]}***`;
  return `${visible}@${domain}`;
}

/**
 * Central transactional email sender via Resend HTTPS API.
 * All application email flows should go through this function.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    throw new ValidationError("A valid recipient email address is required.");
  }

  const from = resolveFromAddress();
  if (!from) {
    throw new ServiceUnavailableError(
      "Email sending is not configured yet.",
      "EMAIL_NOT_CONFIGURED",
    );
  }

  if (!env.RESEND_API_KEY?.trim()) {
    throw new ServiceUnavailableError(
      "Email sending is not configured yet.",
      "EMAIL_NOT_CONFIGURED",
    );
  }

  const replyTo = input.replyTo?.trim() || env.EMAIL_REPLY_TO?.trim() || undefined;
  const toLog = env.NODE_ENV === "production" ? redactEmail(to) : to;

  try {
    const result = await withTimeout(
      getResendClient().emails.send({
        from,
        to: [to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content,
                contentType: attachment.contentType,
                ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
              })),
            }
          : {}),
      }),
      20_000,
      "Resend",
    );

    if (result.error) {
      logger.error("Resend email send failed", {
        provider: "resend",
        to: toLog,
        subject: input.subject,
        name: result.error.name,
        message: result.error.message,
      });
      throw mapResendError(new Error(result.error.message));
    }

    const id = result.data?.id;
    logger.info("Email sent", {
      provider: "resend",
      to: toLog,
      subject: input.subject,
      id: id ?? null,
      success: true,
    });

    return { sent: true, provider: "resend", id };
  } catch (error) {
    if (error instanceof ServiceUnavailableError || error instanceof ValidationError) {
      throw error;
    }
    logger.error("Resend email send failed", {
      provider: "resend",
      to: toLog,
      subject: input.subject,
      message: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
    throw mapResendError(error);
  }
}
