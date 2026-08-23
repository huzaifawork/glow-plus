/**
 * Transactional email sending via Resend (https://resend.com).
 *
 * EMAIL_PROVIDER controls behavior:
 *   "log"    — prints to stdout instead of sending (default, used in local dev)
 *   "resend" — sends a real email via Resend's API
 *
 * Resend was chosen over Postmark/SendGrid for this project because it
 * requires the least setup to get a first real email sending: no SMTP
 * config, a single REST call, and — critically for testing before you own
 * a verified domain — Resend lets you send to your OWN account email
 * using their shared `onboarding@resend.dev` sender with zero domain setup.
 * You only need a verified domain once you're ready to send to real
 * customers instead of just testing to yourself.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Glow+ <onboarding@resend.dev>';

export interface SendEmailInput {
  to: string;
  template: 'confirm-email' | 'reset-password' | 'trial-ending-soon' | 'payment-failed' | 'reward-unlocked';
  data: Record<string, unknown>;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (process.env.EMAIL_PROVIDER === 'resend') {
    return sendViaResend(input);
  }

  // eslint-disable-next-line no-console
  console.log(`[email:${input.template}] -> ${input.to}`, input.data);
}

async function sendViaResend(input: SendEmailInput): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('EMAIL_PROVIDER is set to "resend" but RESEND_API_KEY is missing from your .env file.');
  }

  const { subject, html } = renderTemplate(input.template, input.data);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: input.to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

/**
 * Very small, dependency-free HTML templates. Swap for React Email,
 * MJML, or Resend's own template support once you want real design —
 * these are intentionally plain so the integration itself is easy to
 * verify first.
 */
function renderTemplate(template: SendEmailInput['template'], data: Record<string, unknown>): { subject: string; html: string } {
  switch (template) {
    case 'confirm-email':
      return {
        subject: 'Confirm your Glow+ email',
        html: `<p>Welcome to Glow+! Click the link below to confirm your email address:</p>
               <p><a href="${data.verifyUrl}">${data.verifyUrl}</a></p>
               <p>If you didn't request this, you can ignore this email.</p>`,
      };
    case 'reset-password':
      return {
        subject: 'Reset your Glow+ password',
        html: `<p>We received a request to reset your Glow+ password. Click the link below to choose a new one:</p>
               <p><a href="${data.resetUrl}">${data.resetUrl}</a></p>
               <p>This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.</p>`,
      };
    case 'trial-ending-soon':
      return {
        subject: 'Your Glow+ trial is ending soon',
        html: `<p>Your trial ends on ${data.trialEnd}. Add a payment method to keep your account active.</p>`,
      };
    case 'payment-failed':
      return {
        subject: 'Action needed: your Glow+ payment failed',
        html: `<p>We couldn't process your last payment. <a href="${data.invoiceUrl}">Update your payment method</a> to avoid an interruption.</p>`,
      };
    case 'reward-unlocked':
      return {
        subject: 'You unlocked a reward on Glow+! 🎉',
        html: `<p>Nice! You just unlocked: ${(data.rewards as string[])?.join(', ')}</p>`,
      };
  }
}