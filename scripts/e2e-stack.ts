import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const PIDS_FILE = resolve(REPO_ROOT, '.e2e-pids.json');

const WORKERS = [0, 1, 2] as const;

function apiPort(w: number) { return 4001 + w; }
function webPort(w: number) { return 4101 + w; }
function dbName(w: number) { return `wind_e2e_w${w}`; }

function dbUrl(w: number) {
  return `postgresql://wind:wind_dev@localhost:5434/${dbName(w)}`;
}

async function waitForHttp(url: string, maxMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function start(): Promise<void> {
  const pids: number[] = [];
  const processes: ChildProcess[] = [];

  // Start all API servers first
  for (const w of WORKERS) {
    const apiEnv = {
      ...process.env,
      DATABASE_URL: dbUrl(w),
      PORT: String(apiPort(w)),
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test' as const,
      BANK_PROVIDER: 'mock',
      WEBHOOK_SECRET_WIND_CLINIC: 'e2e-wind-clinic-secret',
      WEBHOOK_SECRET_WIND_STOCK: 'e2e-wind-stock-secret',
    };
    const api = spawn(
      'bun',
      ['run', 'src/index.ts'],
      {
        cwd: resolve(REPO_ROOT, 'apps/api'),
        env: apiEnv,
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: false,
      },
    );
    if (api.pid) pids.push(api.pid);
    processes.push(api);
  }

  // Wait for all API servers to be healthy before starting web
  console.log('[e2e-stack] Waiting for API servers to become healthy...');
  await Promise.all(
    WORKERS.map((w) => waitForHttp(`http://localhost:${apiPort(w)}/health`, 30_000))
  );
  console.log('[e2e-stack] All API servers healthy, starting web servers...');

  // Build Next.js 3 times — once per worker — each with a unique NEXT_PUBLIC_API_URL
  // and a unique distDir (NEXT_DIST_DIR). This ensures the routes manifest for each
  // instance proxies to the correct isolated API port, overriding any .env.local value.
  console.log('[e2e-stack] Building Next.js 3× (one per worker)...');
  for (const w of WORKERS) {
    console.log(`[e2e-stack]   building worker ${w} (→ port ${apiPort(w)})...`);
    execSync('bun run next build', {
      cwd: resolve(REPO_ROOT, 'apps/web'),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production' as const,
        NEXT_PUBLIC_API_URL: `http://localhost:${apiPort(w)}`,
        NEXT_DIST_DIR: `.next-w${w}`,
      },
    });
  }

  // Now start all web servers using next start, each pointing at its own dist dir
  for (const w of WORKERS) {
    const webEnv = {
      ...process.env,
      NEXT_DIST_DIR: `.next-w${w}`,
      PORT: String(webPort(w)),
      NODE_ENV: 'production' as const,
    };
    const web = spawn(
      'bun',
      ['run', 'next', 'start', '-p', String(webPort(w))],
      {
        cwd: resolve(REPO_ROOT, 'apps/web'),
        env: webEnv,
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: false,
      },
    );
    if (web.pid) pids.push(web.pid);
    processes.push(web);
  }

  writeFileSync(PIDS_FILE, JSON.stringify(pids));

  console.log('[e2e-stack] Waiting for all web servers to become healthy...');
  await Promise.all(
    WORKERS.map((w) => waitForHttp(`http://localhost:${webPort(w)}`, 30_000))
  );
  console.log('[e2e-stack] All processes healthy.');
}

export async function stop(): Promise<void> {
  if (!existsSync(PIDS_FILE)) return;
  let pids: number[] = [];
  try {
    pids = JSON.parse(readFileSync(PIDS_FILE, 'utf8'));
  } catch {
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // process may already be dead
    }
  }
  unlinkSync(PIDS_FILE);
  console.log('[e2e-stack] All processes terminated.');
}
