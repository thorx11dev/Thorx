/**
 * THORX email service — wraps Resend for transactional emails.
 *
 * Set RESEND_API_KEY in Replit environment secrets to activate.
 * RESEND_FROM should be set to a verified sender address; defaults to
 * "THORX <noreply@thorx.app>" which requires thorx.app to be verified in Resend.
 * In development, set RESEND_FROM to a Resend sandbox address or leave
 * RESEND_API_KEY unset — all sends will be no-ops with a warning log.
 */

import { Resend } from "resend";
import { logger } from "./logger";

let _client: Resend | null = null;

function getClient(): Resend | null {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("[Email] RESEND_API_KEY not set — email sending is disabled");
    return null;
  }
  _client = new Resend(key);
  return _client;
}

const FROM_ADDRESS = process.env.RESEND_FROM ?? "THORX <noreply@thorx.app>";

export async function sendPasswordResetEmail(params: {
  to: string;
  firstName: string;
  resetUrl: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ to: params.to }, "[Email] Password-reset email suppressed — no RESEND_API_KEY");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: "THORX — Reset Your Password",
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:sans-serif;background:#f4f4f4;padding:24px;margin:0;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#000;padding:20px 24px;">
            <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:-0.5px;">THORX</h1>
          </div>
          <div style="padding:28px 24px;">
            <h2 style="font-size:18px;margin:0 0 12px;color:#111;">Hi ${params.firstName},</h2>
            <p style="color:#444;line-height:1.6;margin:0 0 20px;">
              We received a request to reset your THORX password.
              Click the button below — this link is valid for <strong>60 minutes</strong>.
            </p>
            <a href="${params.resetUrl}"
               style="display:inline-block;background:#000;color:#fff;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;">
              Reset Password
            </a>
            <p style="color:#777;font-size:12px;margin:20px 0 0;line-height:1.6;">
              If you did not request a password reset, you can safely ignore this email —
              your account remains secure.<br>
              Link: <a href="${params.resetUrl}" style="color:#000;">${params.resetUrl}</a>
            </p>
          </div>
          <div style="background:#f8f8f8;padding:14px 24px;border-top:1px solid #eee;">
            <p style="color:#aaa;font-size:11px;margin:0;">© 2026 THORX. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    logger.error({ err: error, to: params.to }, "[Email] Failed to send password-reset email");
    throw new Error(`Email delivery failed: ${error.message ?? "unknown Resend error"}`);
  }

  logger.info({ to: params.to }, "[Email] Password-reset email sent");
}

export async function sendPayoutStatusEmail(params: {
  to: string;
  firstName: string;
  status: "approved" | "completed" | "rejected";
  amount: string | number;
  netAmount: string | number;
  fee?: string | number;
  method?: string;
  rejectionReason?: string | null;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ to: params.to }, "[Email] Payout status email suppressed — no RESEND_API_KEY");
    return;
  }

  const rejected = params.status === "rejected";
  const statusLabel = rejected ? "PAYOUT REJECTED" : params.status === "completed" ? "PAYOUT PAID" : "PAYOUT APPROVED";
  const accent = rejected ? "#dc2626" : "#16a34a";
  const methodLabel = params.method ? String(params.method).toUpperCase() : "LOCAL WALLET";

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: rejected
      ? `THORX — Payout Request Rejected (Rs.${params.amount})`
      : `THORX — Payout ${params.status === "completed" ? "Paid" : "Approved"}: Rs.${params.netAmount}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:sans-serif;background:#f4f4f4;padding:24px;margin:0;">
        <div style="max-width:520px;margin:0 auto;background:#fff;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#000;padding:20px 24px;">
            <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:-0.5px;">THORX</h1>
          </div>
          <div style="padding:28px 24px;">
            <p style="font-size:11px;font-weight:700;letter-spacing:2px;color:${accent};margin:0 0 8px;">
              ${statusLabel}
            </p>
            <h2 style="font-size:18px;margin:0 0 12px;color:#111;">Hi ${params.firstName},</h2>
            ${
              rejected
                ? `<p style="color:#444;line-height:1.6;margin:0 0 16px;">
                     Your payout request of <strong>Rs.${params.amount}</strong> could not be processed.
                     ${params.rejectionReason ? `Reason: <strong>${params.rejectionReason}</strong>.` : ""}
                     Your balance has been restored — you can submit a new request anytime.
                   </p>`
                : `<p style="color:#444;line-height:1.6;margin:0 0 16px;">
                     Your payout of <strong>Rs.${params.netAmount}</strong> has been ${params.status === "completed" ? "paid out" : "approved and is on its way"} via
                     <strong>${methodLabel}</strong>. Amounts reflect in your wallet shortly.
                   </p>`
            }
            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333;margin:0 0 20px;">
              <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">Request Amount</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">Rs.${params.amount}</td></tr>
              ${!rejected && params.fee !== undefined ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">Processing Fee</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">Rs.${params.fee}</td></tr>` : ""}
              <tr><td style="padding:8px 0;font-weight:700;">${rejected ? "Restored to Balance" : "Net Payout"}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:${accent};">Rs.${rejected ? params.amount : params.netAmount}</td></tr>
            </table>
            <p style="color:#777;font-size:12px;margin:0;line-height:1.6;">
              Questions? Reply to this email or reach the help section inside the THORX app.
            </p>
          </div>
          <div style="background:#f8f8f8;padding:14px 24px;border-top:1px solid #eee;">
            <p style="color:#aaa;font-size:11px;margin:0;">© 2026 THORX. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    logger.error({ err: error, to: params.to }, "[Email] Failed to send payout status email");
    throw new Error(`Email delivery failed: ${error.message ?? "unknown Resend error"}`);
  }

  logger.info({ to: params.to, status: params.status }, "[Email] Payout status email sent");
}

export async function sendTeamInvitationEmail(params: {
  to: string;
  role: string;
  inviteUrl: string;
  invitedByName: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ to: params.to }, "[Email] Team invitation email suppressed — no RESEND_API_KEY");
    return;
  }

  const roleLabel = params.role === "admin" ? "Admin" : "Team";

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `THORX — You've been invited to join as ${roleLabel}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:sans-serif;background:#f4f4f4;padding:24px;margin:0;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#000;padding:20px 24px;">
            <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:-0.5px;">THORX</h1>
          </div>
          <div style="padding:28px 24px;">
            <h2 style="font-size:18px;margin:0 0 12px;color:#111;">You're invited</h2>
            <p style="color:#444;line-height:1.6;margin:0 0 20px;">
              ${params.invitedByName} invited you to join the THORX team portal as
              <strong>${roleLabel}</strong>. Click below to set your password and activate access —
              this link is valid for <strong>48 hours</strong>.
            </p>
            <a href="${params.inviteUrl}"
               style="display:inline-block;background:#000;color:#fff;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;">
              Accept Invitation
            </a>
            <p style="color:#777;font-size:12px;margin:20px 0 0;line-height:1.6;">
              If you weren't expecting this, you can safely ignore this email.<br>
              Link: <a href="${params.inviteUrl}" style="color:#000;">${params.inviteUrl}</a>
            </p>
          </div>
          <div style="background:#f8f8f8;padding:14px 24px;border-top:1px solid #eee;">
            <p style="color:#aaa;font-size:11px;margin:0;">© 2026 THORX. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    logger.error({ err: error, to: params.to }, "[Email] Failed to send team invitation email");
    throw new Error(`Email delivery failed: ${error.message ?? "unknown Resend error"}`);
  }

  logger.info({ to: params.to }, "[Email] Team invitation email sent");
}
