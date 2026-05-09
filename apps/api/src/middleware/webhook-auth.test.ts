import { describe, test, expect, beforeAll } from 'bun:test';
import crypto from 'node:crypto';
import Elysia from 'elysia';
import { webhookAuth } from './webhook-auth';
import { errorHandler } from './error-handler';

const SECRET = 'test-webhook-secret-32-bytes-long!!';
const ENV_VAR = 'WEBHOOK_SECRET_TEST';

beforeAll(() => {
  process.env[ENV_VAR] = SECRET;
});

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function buildApp() {
  return new Elysia()
    .use(errorHandler)
    .group('/hook', (a) =>
      a
        .use(webhookAuth(ENV_VAR))
        .post('/echo', ({ body }) => ({ success: true, data: body }))
    );
}

function postSigned(
  app: ReturnType<typeof buildApp>,
  body: string,
  opts: { signature?: string; timestamp?: string } = {}
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.signature !== undefined) headers['x-signature'] = opts.signature;
  if (opts.timestamp !== undefined) headers['x-timestamp'] = opts.timestamp;
  return app.handle(
    new Request('http://localhost/hook/echo', {
      method: 'POST',
      headers,
      body,
    })
  );
}

describe('webhookAuth middleware', () => {
  test('valid signature + fresh timestamp → 200', async () => {
    const app = buildApp();
    const body = JSON.stringify({ event: 'visit.completed', visit_id: 'v1' });
    const ts = Date.now().toString();
    const res = await postSigned(app, body, { signature: sign(body), timestamp: ts });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.visit_id).toBe('v1');
  });

  test('bad signature → 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const app = buildApp();
    const body = JSON.stringify({ event: 'visit.completed', visit_id: 'v2' });
    const ts = Date.now().toString();
    const bogus = sign(body, 'wrong-secret');
    const res = await postSigned(app, body, { signature: bogus, timestamp: ts });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  test('missing signature header → 401', async () => {
    const app = buildApp();
    const body = JSON.stringify({ event: 'visit.completed' });
    const res = await postSigned(app, body, { timestamp: Date.now().toString() });
    expect(res.status).toBe(401);
  });

  test('missing timestamp header → 401', async () => {
    const app = buildApp();
    const body = JSON.stringify({ event: 'visit.completed' });
    const res = await postSigned(app, body, { signature: sign(body) });
    expect(res.status).toBe(401);
  });

  test('timestamp older than 5 min → 401 TIMESTAMP_TOO_OLD', async () => {
    const app = buildApp();
    const body = JSON.stringify({ event: 'visit.completed', visit_id: 'v3' });
    const oldTs = (Date.now() - 6 * 60 * 1000).toString();
    const res = await postSigned(app, body, { signature: sign(body), timestamp: oldTs });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('TIMESTAMP_TOO_OLD');
  });

  test('signature for tampered body fails → 401', async () => {
    const app = buildApp();
    const original = JSON.stringify({ event: 'visit.completed', amount: '100.00' });
    const sigForOriginal = sign(original);
    const tampered = JSON.stringify({ event: 'visit.completed', amount: '999999.00' });
    const res = await postSigned(app, tampered, {
      signature: sigForOriginal,
      timestamp: Date.now().toString(),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });

  test('non-hex signature header → 401 (no crash)', async () => {
    const app = buildApp();
    const body = JSON.stringify({ event: 'visit.completed' });
    const res = await postSigned(app, body, {
      signature: 'not-hex-!!!',
      timestamp: Date.now().toString(),
    });
    expect(res.status).toBe(401);
  });
});
