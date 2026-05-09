import type { Prisma } from '@prisma/client';

export interface AccountMap {
  wind_clinic_service_to_revenue: Record<string, string>;
  wind_clinic_product_to_revenue: Record<string, string>;
  wind_clinic_payment_to_bank: Record<string, string>;
  card_fee_account: string;
  default_ar_account: string;
  default_ap_account: string;
  doctor_commission_account?: string;
  doctor_commission_payable?: string;
}

const DEFAULT_CARD_FEE_ACCOUNT = '61070';
const DEFAULT_AR_ACCOUNT = '12010';
const DEFAULT_AP_ACCOUNT = '21010';
const DEFAULT_REVENUE_ACCOUNT = '41090';

export async function getAccountMap(tx: Prisma.TransactionClient): Promise<AccountMap> {
  const setting = await tx.setting.findUnique({ where: { key: 'account_map' } });
  if (!setting) {
    throw new Error('account_map setting not found — run seed first');
  }
  return setting.value as AccountMap;
}

function resolveFromMap(
  code: string,
  map: Record<string, string>,
  fallback: string,
  context: string,
): { account: string; usedFallback: boolean } {
  // 1. Exact match
  if (map[code]) return { account: map[code], usedFallback: false };

  // 2. Wildcard prefix: key ending with '*' matches codes starting with that prefix
  for (const key of Object.keys(map)) {
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      if (code.startsWith(prefix)) {
        return { account: map[key], usedFallback: false };
      }
    }
  }

  // 3. DEFAULT key
  const defaultAccount = map['DEFAULT'] ?? fallback;
  console.warn(
    `[account-map] ${context} code "${code}" not found — falling back to ${defaultAccount}. ` +
      'Update Settings > Account Map to add a specific mapping.',
  );
  return { account: defaultAccount, usedFallback: true };
}

export function mapServiceToAccount(code: string, map: AccountMap): string {
  const { account } = resolveFromMap(
    code,
    map.wind_clinic_service_to_revenue,
    DEFAULT_REVENUE_ACCOUNT,
    'Service',
  );
  return account;
}

export function mapProductToAccount(code: string, map: AccountMap): string {
  const { account } = resolveFromMap(
    code,
    map.wind_clinic_product_to_revenue,
    DEFAULT_REVENUE_ACCOUNT,
    'Product',
  );
  return account;
}

export function mapPaymentMethodToBank(
  method: string,
  bankAccountCode: string | undefined | null,
  map: AccountMap,
): string {
  // Explicit bank_account_code from the payload takes precedence over the map default
  if (bankAccountCode) return bankAccountCode;

  const mapped = map.wind_clinic_payment_to_bank[method];
  if (mapped) return mapped;

  console.warn(
    `[account-map] Payment method "${method}" not found in payment_to_bank map and no bank_account_code provided`,
  );
  return map.wind_clinic_payment_to_bank['DEFAULT'] ?? '';
}

export function getCardFeeAccount(map: AccountMap): string {
  return map.card_fee_account ?? DEFAULT_CARD_FEE_ACCOUNT;
}

export function getDefaultARAccount(map: AccountMap): string {
  return map.default_ar_account ?? DEFAULT_AR_ACCOUNT;
}

export function getDefaultAPAccount(map: AccountMap): string {
  return map.default_ap_account ?? DEFAULT_AP_ACCOUNT;
}
