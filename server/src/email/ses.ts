/**
 * AWS SES email sender.
 *
 * Thin wrapper around @aws-sdk/client-ses, mirroring the pelemobil sesClient
 * pattern. Used by the emailWorker to deliver registration verification codes.
 * EMAIL_FROM must be a SES-verified identity in AWS_SES_REGION.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const REGION = process.env.AWS_SES_REGION || 'eu-west-1';
const FROM = process.env.EMAIL_FROM || '';

const client = new SESClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const TTL_MINUTES = Math.round((parseInt(process.env.EMAIL_CODE_TTL_SECONDS || '7200', 10)) / 60);

export async function sendVerificationCodeEmail(to: string, code: string) {
  if (!FROM) throw new Error('EMAIL_FROM is not set');

  const subject = `${code} is your HelloVia Translate verification code`;
  const text =
    `Your HelloVia Translate verification code is ${code}.\n\n` +
    `Enter it on the sign-up screen to finish creating your account. ` +
    `This code expires in ${TTL_MINUTES} minutes.\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">` +
    `<h2 style="margin:0 0 16px">Verify your email</h2>` +
    `<p style="margin:0 0 16px;color:#555">Use this code to finish creating your HelloVia Translate account:</p>` +
    `<div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:12px;padding:18px 0;text-align:center;margin:0 0 16px">${code}</div>` +
    `<p style="margin:0 0 8px;color:#888;font-size:13px">This code expires in ${TTL_MINUTES} minutes.</p>` +
    `<p style="margin:0;color:#888;font-size:13px">If you didn't request this, you can ignore this email.</p>` +
    `</div>`;

  return client.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Charset: 'UTF-8', Data: subject },
      Body: {
        Html: { Charset: 'UTF-8', Data: html },
        Text: { Charset: 'UTF-8', Data: text },
      },
    },
  }));
}
