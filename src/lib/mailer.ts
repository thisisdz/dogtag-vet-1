import "server-only";
import nodemailer from "nodemailer";
import {getServerEnv} from "@/lib/env";

export interface SendMailAttachment {
  filename: string;
  content: string; // base64
  encoding: "base64";
  contentType?: string;
  /** Content-ID for an inline image referenced from `html` as `<img src="cid:...">`. */
  cid?: string;
}

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML alternative; `text` is always sent too for plain-text mail clients. */
  html?: string;
  attachments?: SendMailAttachment[];
}

/** What happened to a message: delivered to SMTP, only logged (no SMTP configured), or failed. */
export type SendMailOutcome = "sent" | "logged" | "failed";

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  const env = getServerEnv();
  if (!env.EMAIL_SERVER) return null;
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport(env.EMAIL_SERVER);
  }
  return cachedTransport;
}

/**
 * Sends mail if SMTP (`EMAIL_SERVER`/`EMAIL_FROM`) is configured; otherwise logs the message to
 * the console instead of sending it - the documented dev/test fallback (per wp4-vet.md's
 * "nodemailer console-fallback") so booking, payment, and mint flows keep working end-to-end on a
 * bare checkout with no mail server. Never throws: a booking or payment must still succeed even
 * when mail delivery fails, so callers should treat this as best-effort and log/report failures
 * without rolling back the operation that triggered the email. The returned outcome is
 * informational (e.g. so a UI can say "logged, not sent - SMTP isn't configured").
 */
export async function sendMail(params: SendMailParams): Promise<SendMailOutcome> {
  const env = getServerEnv();
  const transport = getTransport();

  if (!transport || !env.EMAIL_FROM) {
    console.log(
      `[mailer console-fallback] to=${params.to} subject=${JSON.stringify(params.subject)}\n${params.text}` +
        (params.attachments?.length ? `\n(with ${params.attachments.length} attachment(s))` : ""),
    );
    return "logged";
  }

  try {
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? {html: params.html} : {}),
      attachments: params.attachments,
    });
    return "sent";
  } catch (err) {
    console.error(`[mailer] failed to send to ${params.to}:`, err);
    return "failed";
  }
}
