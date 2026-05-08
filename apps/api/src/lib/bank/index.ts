import type { BankProvider } from './provider';
import { MockBankProvider } from './mock-provider';

export function getBankProvider(): BankProvider {
  const provider = process.env.BANK_PROVIDER ?? 'mock';

  switch (provider) {
    case 'mock':
      return new MockBankProvider();
    case 'kbank':
      throw new Error('KBank provider not yet implemented');
    default:
      throw new Error(`Unknown bank provider: ${provider}`);
  }
}
