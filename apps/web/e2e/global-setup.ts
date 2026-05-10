import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '../../..');

export default async function globalSetup() {
  console.log('[e2e] Starting docker postgres...');
  execSync('docker compose -f docker-compose.e2e.yml up -d --wait', {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  });

  console.log('[e2e] Running migrations + seed on each worker DB...');
  for (const w of [0, 1, 2]) {
    const url = `postgresql://wind:wind_dev@localhost:5434/wind_e2e_w${w}`;
    execSync(
      `DATABASE_URL='${url}' bunx prisma migrate deploy`,
      { stdio: 'inherit', cwd: resolve(REPO_ROOT, 'apps/api') },
    );
    execSync(
      `DATABASE_URL='${url}' bun run prisma/seed.ts`,
      { stdio: 'inherit', cwd: resolve(REPO_ROOT, 'apps/api') },
    );
  }

  console.log('[e2e] Spawning 3× API + 3× Web...');
  const { start } = await import('../../../scripts/e2e-stack');
  await start();

  console.log('[e2e] Pre-creating auth storageState for each role × worker...');
  const { createAuthStorageStates } = await import('./fixtures/auth');
  await createAuthStorageStates();

  console.log('[e2e] Global setup complete.');
}
