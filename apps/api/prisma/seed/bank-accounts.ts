import { BankName } from "@prisma/client";
import type { PrismaClient, Prisma } from "@prisma/client";

export const BANK_ACCOUNTS: Prisma.BankAccountCreateManyInput[] = [
  {
    code: "KBANK-001",
    name: "KBank Current — 0123456789",
    bank_name: BankName.KBANK,
    account_number: "0123456789",
    account_type: "current",
    gl_account_code: "11020",
  },
  {
    // Dedicated sub-account used for ภพ.30 VAT payment transfers
    code: "KBANK-VAT",
    name: "KBank ภพ.30 — 0123456790",
    bank_name: BankName.KBANK,
    account_number: "0123456790",
    account_type: "current",
    gl_account_code: "11020",
  },
  {
    code: "CASH-001",
    name: "Cash on Hand",
    bank_name: BankName.CASH,
    account_type: "current",
    gl_account_code: "11010",
  },
];

export async function seedBankAccounts(prisma: PrismaClient): Promise<void> {
  for (const ba of BANK_ACCOUNTS) {
    await prisma.bankAccount.upsert({
      where: { code: ba.code },
      update: {},
      create: ba,
    });
  }
}
