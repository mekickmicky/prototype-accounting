import Elysia from 'elysia';
import crypto from 'node:crypto';
import { BusinessRuleError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { logAuditEvent } from '../services/audit-log';

const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

function getToleranceMs(): number {
  const raw = process.env.WEBHOOK_TIMESTAMP_TOLERANCE_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMESTAMP_TOLERANCE_MS;
}

// Symbol-keyed stash so we don't collide with other middlewares mutating the request.
const RAW_BODY = Symbol.for('wind-acc.webhook.rawBody');

type RawBodyHolder = { [RAW_BODY]?: string };

function deriveSource(secretEnvVar: string): string {
  return secretEnvVar.replace(/^WEBHOOK_SECRET_/, '').toLowerCase().replace(/_/g, '-');
}

function extractIp(headers: Record<string, string | undefined>): string {
  return (
    headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    headers['x-real-ip'] ??
    'unknown'
  );
}

// Elysia plugin factory: validates HMAC-SHA256 signature + timestamp on incoming webhooks.
//
// Headers expected:
//   x-signature: hex-encoded HMAC-SHA256 over the raw request body
//   x-timestamp: unix-ms; must be within WEBHOOK_TIMESTAMP_TOLERANCE_MS of now
//
// Apply to a sub-app/group:
//   app.group('/webhooks/wind-clinic', (a) =>
//     a.use(webhookAuth('WEBHOOK_SECRET_WIND_CLINIC')).post('/visit-completed', handler)
//   )
//
// `secretEnvVar` is the *name* of the env var holding the shared secret, not the secret itself.
// The secret is read on every request so rotated values take effect without restart.
export const webhookAuth =
  (secretEnvVar: string) =>
  (app: Elysia) =>
    app
      .onParse(async ({ request }, contentType) => {
        const text = await request.text();
        (request as unknown as RawBodyHolder)[RAW_BODY] = text;
        if (contentType.includes('json')) {
          if (text.length === 0) return {};
          try {
            return JSON.parse(text);
          } catch {
            // Fall through — downstream Zod validation will reject malformed JSON.
            return text;
          }
        }
        return text;
      })
      .onBeforeHandle(({ request, headers }) => {
        const source = deriveSource(secretEnvVar);
        const ip = extractIp(headers as Record<string, string | undefined>);

        const logRejection = (reason: string) => {
          void logAuditEvent(prisma, {
            action: 'WEBHOOK_REJECTED',
            entity_type: 'webhook',
            entity_id: source,
            reason,
            ip_address: ip,
          }).catch(() => {});
        };

        const secret = process.env[secretEnvVar];
        if (!secret) {
          throw new BusinessRuleError('INTERNAL_ERROR', { reason: `${secretEnvVar} not configured` });
        }

        const sigHeader = headers['x-signature'];
        const tsHeader = headers['x-timestamp'];
        if (!sigHeader || !tsHeader) {
          logRejection('WEBHOOK_SIGNATURE_INVALID');
          throw new BusinessRuleError('WEBHOOK_SIGNATURE_INVALID');
        }

        const tsNum = Number(tsHeader);
        if (!Number.isFinite(tsNum) || Date.now() - tsNum > getToleranceMs()) {
          logRejection('TIMESTAMP_TOO_OLD');
          throw new BusinessRuleError('TIMESTAMP_TOO_OLD');
        }

        const rawBody = (request as unknown as RawBodyHolder)[RAW_BODY] ?? '';
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

        let sigBuf: Buffer;
        let expBuf: Buffer;
        try {
          sigBuf = Buffer.from(sigHeader, 'hex');
          expBuf = Buffer.from(expected, 'hex');
        } catch {
          logRejection('WEBHOOK_SIGNATURE_INVALID');
          throw new BusinessRuleError('WEBHOOK_SIGNATURE_INVALID');
        }
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          logRejection('WEBHOOK_SIGNATURE_INVALID');
          throw new BusinessRuleError('WEBHOOK_SIGNATURE_INVALID');
        }
      });
