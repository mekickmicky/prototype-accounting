import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '../../..');

export default async function globalTeardown() {
  const { stop } = await import('../../../scripts/e2e-stack');
  await stop();
  if (!process.env.E2E_KEEP_DB) {
    execSync('docker compose -f docker-compose.e2e.yml down -v', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }
}
