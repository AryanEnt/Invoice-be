/**
 * Development-only email smoke test via Resend.
 *
 * Usage (from be/):
 *   npx tsx scripts/send-test-email.ts you@example.com
 *   npx tsx scripts/send-test-email.ts you@example.com --with-pdf
 *
 * Requires RESEND_API_KEY and EMAIL_FROM in .env.
 * Does not expose a public HTTP route.
 */
import { config as loadEnv } from "dotenv";
import { resolveFromAddress, sendEmail } from "../src/services/email.service.js";

loadEnv();

async function main(): Promise<void> {
  const to = process.argv[2]?.trim();
  const withPdf = process.argv.includes("--with-pdf");

  if (!to || !to.includes("@")) {
    console.error("Usage: npx tsx scripts/send-test-email.ts <recipient@example.com> [--with-pdf]");
    process.exit(1);
  }

  const from = resolveFromAddress();
  if (!from || !process.env.RESEND_API_KEY?.trim()) {
    console.error("Missing RESEND_API_KEY or EMAIL_FROM in environment.");
    process.exit(1);
  }

  const result = await sendEmail({
    to,
    subject: "OutInvoice Resend test",
    html: `
      <p>This is a Resend HTTPS API test from OutInvoice.</p>
      <p>From: ${from}</p>
      ${withPdf ? "<p>A sample PDF attachment is included.</p>" : ""}
    `,
    attachments: withPdf
      ? [
          {
            filename: "resend-test.pdf",
            content: Buffer.from("%PDF-1.4\n% OutInvoice Resend test\n"),
            contentType: "application/pdf",
          },
        ]
      : undefined,
  });

  console.log(JSON.stringify({ ok: true, provider: result.provider, id: result.id ?? null }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Email test failed");
  process.exit(1);
});
