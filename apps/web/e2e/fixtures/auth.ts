import { test as base, type BrowserContext, chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stackForWorker } from './stack';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROLES = [
  { role: 'admin', email: 'admin@wind' },
  { role: 'accountant', email: 'aow@wind' },
  { role: 'viewer', email: 'viewer1@wind' },
] as const;

type RoleName = (typeof ROLES)[number]['role'];

function storageStatePath(role: RoleName, workerIndex: number): string {
  return resolve(__dirname, `.auth-${role}-w${workerIndex}.json`);
}

/**
 * Pre-create storageState JSON files for each (role × worker) combination.
 * Called from globalSetup after servers are healthy.
 */
export async function createAuthStorageStates(): Promise<void> {
  const browser = await chromium.launch();

  for (let w = 0; w < 3; w++) {
    const { apiUrl } = stackForWorker(w);

    // Fetch the user list
    const usersRes = await fetch(`${apiUrl}/api/v1/auth/users`);
    const usersJson = await usersRes.json() as { data: { users: { id: string; email: string }[] } };
    const users = usersJson.data.users;

    for (const { role, email } of ROLES) {
      const user = users.find((u) => u.email === email);
      if (!user) throw new Error(`User ${email} not found in worker ${w} DB`);

      const context = await browser.newContext();

      // POST login — capture cookie
      const loginRes = await context.request.post(`${apiUrl}/api/v1/auth/login`, {
        data: { user_id: user.id },
      });
      if (!loginRes.ok()) {
        throw new Error(`Login failed for ${email} on worker ${w}: ${loginRes.status()}`);
      }

      const path = storageStatePath(role, w);
      mkdirSync(dirname(path), { recursive: true });
      await context.storageState({ path });
      await context.close();
    }
  }

  await browser.close();
}

// ── Playwright fixtures ────────────────────────────────────────────────────────

type AuthFixtures = {
  authedContext: BrowserContext;
};

function makeRoleTest(role: RoleName) {
  return base.extend<AuthFixtures>({
    authedContext: async ({ browser }, use, testInfo) => {
      const workerIndex = testInfo.parallelIndex;
      const path = storageStatePath(role, workerIndex);
      const context = await browser.newContext({
        storageState: path,
        baseURL: stackForWorker(workerIndex).webUrl,
      });
      await use(context);
      await context.close();
    },
    page: async ({ authedContext }, use) => {
      const page = await authedContext.newPage();
      await use(page);
      await page.close();
    },
  });
}

export const adminTest = makeRoleTest('admin');
export const accountantTest = makeRoleTest('accountant');
export const viewerTest = makeRoleTest('viewer');

export { storageStatePath };
