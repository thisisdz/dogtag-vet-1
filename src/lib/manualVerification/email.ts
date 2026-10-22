import QRCode from "qrcode";
import type {SendMailParams} from "@/lib/mailer";
import type {ManualVerificationKind} from "@/lib/manualVerification/stateMachine";

/**
 * The "ready to claim" email: a magic link to tap on the phone (first, since most owners read
 * email there) and the same link as a QR code to scan from a computer. Both open
 * `/claim/<token>`, which hands off to the DogTag app; nothing is granted by opening the link
 * itself (the app must redeem it), so a mail scanner following it cannot use it up.
 */
export interface ClaimEmailInput {
  to: string;
  ownerName: string;
  petName: string;
  kind: ManualVerificationKind;
  claimUrl: string;
  expiresAt: Date;
  issuerName: string;
}

const QR_CID = "dogtag-claim-qr";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function buildClaimEmail(input: ClaimEmailInput): Promise<SendMailParams> {
  const what = input.kind === "vaccination" ? `${input.petName}'s verified vaccination record` : `${input.petName}'s DogTag`;
  const expires = input.expiresAt.toLocaleDateString("en-US", {year: "numeric", month: "long", day: "numeric", timeZone: "UTC"});
  const subject = input.kind === "vaccination" ? `${input.petName}'s vaccination record is verified` : `${input.petName}'s DogTag is ready`;

  const text = [
    `Hi ${input.ownerName},`,
    "",
    `${what} is ready. ${input.issuerName} verified it.`,
    "",
    "On your phone, open this link to add it to the DogTag app:",
    input.claimUrl,
    "",
    "On a computer? Scan the QR code in this email with your phone instead.",
    "",
    `This link works until ${expires}. If it expires, reply to this email and we'll send a new one.`,
    "",
    "DogTag Verify",
  ].join("\n");

  const qrPng = await QRCode.toBuffer(input.claimUrl, {margin: 2, width: 320, color: {dark: "#1E1A19", light: "#FFFFFF"}});

  const html = `<!doctype html>
<html><body style="margin:0;background:#F2EEEC;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1E1A19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:16px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td>
<p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(input.ownerName)},</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5"><strong>${escapeHtml(what)}</strong> is ready. ${escapeHtml(input.issuerName)} verified it.</p>
<p style="margin:0 0 24px" align="center">
<a href="${escapeHtml(input.claimUrl)}" style="display:inline-block;background:#CE372D;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:10px">Add to the DogTag app</a>
</p>
<p style="margin:0 0 8px;font-size:14px;color:#625855" align="center">On a computer? Scan this with your phone:</p>
<p style="margin:0 0 20px" align="center"><img src="cid:${QR_CID}" width="200" height="200" alt="QR code for the same link"></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#625855">This link works until ${escapeHtml(expires)}. If it expires, reply to this email and we'll send a new one.</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#625855" align="center">DogTag Verify &middot; verify.dogtagapp.com</p>
</td></tr></table>
</body></html>`;

  return {
    to: input.to,
    subject,
    text,
    html,
    attachments: [
      {filename: "dogtag-qr-code.png", content: qrPng.toString("base64"), encoding: "base64", contentType: "image/png", cid: QR_CID},
    ],
  };
}
