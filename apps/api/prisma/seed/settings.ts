import type { PrismaClient } from "@prisma/client";

// Account map keys are required by Phase 8 webhook handlers (spec 04 §9.2, spec 10 §5).
// wind_clinic_payment_to_bank values are BankAccount.code references (not GL codes).
const SETTINGS: Record<string, unknown> = {
  company: {
    name_en: "WIND CLINIC Co., Ltd.",
    name_th: "บริษัท วินด์ คลินิก จำกัด",
    tax_id: "0105566123456",
    address: "XX/X ถนนสุขุมวิท กรุงเทพฯ 10110",
    phone: "02-XXX-XXXX",
    email: "contact@wind-clinic.com",
    branches: [
      { code: "TL", name: "ทองหล่อ", branch_office: "00000", address: "" },
      { code: "EK", name: "เอกมัย", branch_office: "00001", address: "" },
      { code: "RAMA9", name: "พระราม 9", branch_office: "00002", address: "" },
    ],
  },

  fiscal_year_start_month: 1,

  default_vat_rate: 7,

  // Critical for auto-generated JEs from webhooks (spec 09).
  account_map: {
    wind_clinic_service_to_revenue: {
      BOTOX_50U: "41010",
      BOTOX_100U: "41010",
      FILLER_HA: "41020",
      LASER_IPL: "41030",
      LASER_FRACT: "41030",
      FACIAL: "41040",
      PEEL: "41040",
      BODY_SLIM: "41050",
      DEFAULT: "41090",
    },
    wind_clinic_product_to_revenue: {
      DEFAULT: "42010",
    },
    // Values are BankAccount.code — Phase 8 resolves them to BankAccount rows.
    wind_clinic_payment_to_bank: {
      CASH: "CASH-001",
      TRANSFER: "KBANK-001",
      CREDIT_CARD: "KBANK-001",
      DEBIT_CARD: "KBANK-001",
      QR: "KBANK-001",
      CHEQUE: "KBANK-001",
    },
    card_fee_account: "61320",
    default_ar_account: "12010",
    default_ap_account: "21010",
    doctor_commission_account: "51020",
    doctor_commission_payable: "21030",
  },

  numbering: {
    JE: "JE-{YYYY}-{NNNN}",
    INV: "INV-{YYYY}-{NNNN}",
    TAX: "TAX-{YYYY}-{NNNN}",
    RCT: "RCT-{YYYY}-{NNNN}",
    BILL: "BILL-{YYYY}-{NNNN}",
    PAY: "PAY-{YYYY}-{NNNN}",
    PP30: "PP30-{YYYY}-{MM}",
    PND3: "PND3-{YYYY}-{MM}",
    PND53: "PND53-{YYYY}-{MM}",
    WHT: "WHT-{YYYY}-{NNNN}",
    CUST: "CUST-{NNNN}",
    VEND: "VEND-{NNNN}",
  },
};

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
