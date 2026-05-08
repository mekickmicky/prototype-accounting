import { Decimal } from 'decimal.js';

export interface VerifySlipInput {
  slipRef: string;
  expectedAmount?: Decimal;
  expectedDate?: Date;
}

export interface SlipVerifyResult {
  verified: boolean;
  reason?: string;
  details?: {
    transRef: string;
    transDate: string;
    sender: { name: string; bankShortName: string; accountTail: string };
    receiver: { name: string; bankShortName: string; accountTail: string };
    amount: Decimal;
  };
}

export interface ImportStatementInput {
  bankAccountCode: string;
  dateFrom: Date;
  dateTo: Date;
}

export interface BankTransactionRaw {
  txnDate: Date;
  description: string;
  debit: Decimal;
  credit: Decimal;
  balance?: Decimal;
  bankRef: string;
}

export interface BankProvider {
  verifySlip(input: VerifySlipInput): Promise<SlipVerifyResult>;
  importStatement(input: ImportStatementInput): Promise<BankTransactionRaw[]>;
  getBalance(bankAccountCode: string): Promise<Decimal>;
  registerWebhook?(url: string): Promise<void>;
}
