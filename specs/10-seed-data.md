# 10 — Seed Data

This spec defines the initial data set the prototype boots with. Goal: realistic enough that all reports populate with meaningful numbers, all features can be demoed, and Claude Code has no excuse to skip implementation steps for "lack of data".

## Seed Strategy

1. **Static seeds** (idempotent, run on every fresh DB): Chart of Accounts, Branches, Bank Accounts, Default Settings, Users
2. **Sample seeds** (run once, optional flag `--with-samples`): Customers, Vendors, 3 months of historical transactions, current open period activity

```bash
# package.json scripts
"db:reset": "prisma migrate reset --force",
"db:seed": "bun run prisma/seed.ts",
"db:seed:full": "bun run prisma/seed.ts --with-samples"
```

## 1. Chart of Accounts (Static)

Full Thai SME chart, tailored for a beauty/aesthetic clinic.

```ts
// prisma/seed/accounts.ts

export const ACCOUNTS = [
  // ═══════ 1xxxx ASSETS ═══════
  { code: '10000', name_en: 'Assets', name_th: 'สินทรัพย์', type: 'ASSET', is_postable: false },
  
  { code: '11000', name_en: 'Current Assets', name_th: 'สินทรัพย์หมุนเวียน', type: 'ASSET', is_postable: false, parent: '10000' },
  { code: '11010', name_en: 'Cash on Hand', name_th: 'เงินสด', type: 'ASSET', parent: '11000' },
  { code: '11020', name_en: 'KBank Current', name_th: 'เงินฝากธนาคาร - กสิกรไทย กระแสรายวัน', type: 'ASSET', parent: '11000' },
  { code: '11030', name_en: 'SCB Savings', name_th: 'เงินฝากธนาคาร - ไทยพาณิชย์ ออมทรัพย์', type: 'ASSET', parent: '11000' },
  { code: '11100', name_en: 'Petty Cash', name_th: 'เงินสดย่อย', type: 'ASSET', parent: '11000' },
  
  { code: '12000', name_en: 'Receivables', name_th: 'ลูกหนี้', type: 'ASSET', is_postable: false, parent: '10000' },
  { code: '12010', name_en: 'Accounts Receivable - Trade', name_th: 'ลูกหนี้การค้า', type: 'ASSET', parent: '12000' },
  { code: '12020', name_en: 'Other Receivables', name_th: 'ลูกหนี้อื่น', type: 'ASSET', parent: '12000' },
  
  { code: '13000', name_en: 'Inventory', name_th: 'สินค้าคงเหลือ', type: 'ASSET', is_postable: false, parent: '10000' },
  { code: '13010', name_en: 'Inventory - Products', name_th: 'สินค้าคงเหลือ - ผลิตภัณฑ์', type: 'ASSET', parent: '13000' },
  { code: '13020', name_en: 'Inventory - Supplies', name_th: 'สินค้าคงเหลือ - วัสดุสิ้นเปลือง', type: 'ASSET', parent: '13000' },
  
  { code: '14000', name_en: 'Tax Assets', name_th: 'ภาษีในสินทรัพย์', type: 'ASSET', is_postable: false, parent: '10000' },
  { code: '14010', name_en: 'VAT Receivable (Input VAT)', name_th: 'ภาษีซื้อ', type: 'ASSET', parent: '14000' },
  { code: '14020', name_en: 'Withholding Tax Receivable', name_th: 'ภาษีถูกหัก ณ ที่จ่าย', type: 'ASSET', parent: '14000' },
  
  { code: '15000', name_en: 'Other Current Assets', name_th: 'สินทรัพย์หมุนเวียนอื่น', type: 'ASSET', is_postable: false, parent: '10000' },
  { code: '15010', name_en: 'Prepaid Expenses', name_th: 'ค่าใช้จ่ายจ่ายล่วงหน้า', type: 'ASSET', parent: '15000' },
  { code: '15020', name_en: 'Deposits', name_th: 'เงินมัดจำ', type: 'ASSET', parent: '15000' },
  
  { code: '16000', name_en: 'Non-current Assets', name_th: 'สินทรัพย์ไม่หมุนเวียน', type: 'ASSET', is_postable: false, parent: '10000' },
  { code: '16010', name_en: 'Equipment', name_th: 'อุปกรณ์', type: 'ASSET', parent: '16000' },
  { code: '16011', name_en: 'Medical Equipment', name_th: 'อุปกรณ์การแพทย์', type: 'ASSET', parent: '16000' },
  { code: '16012', name_en: 'Furniture & Fixtures', name_th: 'เฟอร์นิเจอร์และอุปกรณ์ตกแต่ง', type: 'ASSET', parent: '16000' },
  { code: '16020', name_en: 'Accumulated Depreciation', name_th: 'ค่าเสื่อมราคาสะสม', type: 'ASSET', parent: '16000' },
  
  // ═══════ 2xxxx LIABILITIES ═══════
  { code: '20000', name_en: 'Liabilities', name_th: 'หนี้สิน', type: 'LIABILITY', is_postable: false },
  
  { code: '21000', name_en: 'Current Liabilities', name_th: 'หนี้สินหมุนเวียน', type: 'LIABILITY', is_postable: false, parent: '20000' },
  { code: '21010', name_en: 'Accounts Payable - Trade', name_th: 'เจ้าหนี้การค้า', type: 'LIABILITY', parent: '21000' },
  { code: '21020', name_en: 'Other Payables', name_th: 'เจ้าหนี้อื่น', type: 'LIABILITY', parent: '21000' },
  { code: '21030', name_en: 'Doctor Commission Payable', name_th: 'ค่านายหน้าหมอค้างจ่าย', type: 'LIABILITY', parent: '21000' },
  { code: '21040', name_en: 'Accrued Expenses', name_th: 'ค่าใช้จ่ายค้างจ่าย', type: 'LIABILITY', parent: '21000' },
  
  { code: '21100', name_en: 'Tax Payables', name_th: 'ภาษีค้างจ่าย', type: 'LIABILITY', is_postable: false, parent: '21000' },
  { code: '21110', name_en: 'VAT Payable (Output VAT)', name_th: 'ภาษีขาย', type: 'LIABILITY', parent: '21100' },
  { code: '21120', name_en: 'Withholding Tax Payable', name_th: 'ภาษีหัก ณ ที่จ่าย', type: 'LIABILITY', parent: '21100' },
  { code: '21130', name_en: 'Income Tax Payable', name_th: 'ภาษีเงินได้นิติบุคคลค้างจ่าย', type: 'LIABILITY', parent: '21100' },
  
  { code: '21200', name_en: 'Customer Liabilities', name_th: 'หนี้สินต่อลูกค้า', type: 'LIABILITY', is_postable: false, parent: '21000' },
  { code: '21210', name_en: 'Customer Deposits', name_th: 'เงินรับล่วงหน้าจากลูกค้า', type: 'LIABILITY', parent: '21200' },
  { code: '21220', name_en: 'Unearned Revenue (Packages)', name_th: 'รายได้รับล่วงหน้า (แพ็กเกจ)', type: 'LIABILITY', parent: '21200' },
  
  // ═══════ 3xxxx EQUITY ═══════
  { code: '30000', name_en: 'Equity', name_th: 'ส่วนของผู้ถือหุ้น', type: 'EQUITY', is_postable: false },
  { code: '31010', name_en: 'Owner\'s Capital', name_th: 'ทุนเรือนหุ้น', type: 'EQUITY', parent: '30000' },
  { code: '31020', name_en: 'Retained Earnings', name_th: 'กำไรสะสม', type: 'EQUITY', parent: '30000' },
  { code: '31030', name_en: 'Current Year Earnings', name_th: 'กำไร(ขาดทุน)สุทธิประจำปี', type: 'EQUITY', parent: '30000' },
  
  // ═══════ 4xxxx REVENUE ═══════
  { code: '40000', name_en: 'Revenue', name_th: 'รายได้', type: 'REVENUE', is_postable: false },
  
  { code: '41000', name_en: 'Service Revenue', name_th: 'รายได้ค่าบริการ', type: 'REVENUE', is_postable: false, parent: '40000' },
  { code: '41010', name_en: 'Service Revenue - Botox', name_th: 'รายได้ - Botox', type: 'REVENUE', parent: '41000' },
  { code: '41020', name_en: 'Service Revenue - Filler', name_th: 'รายได้ - Filler', type: 'REVENUE', parent: '41000' },
  { code: '41030', name_en: 'Service Revenue - Laser', name_th: 'รายได้ - เลเซอร์', type: 'REVENUE', parent: '41000' },
  { code: '41040', name_en: 'Service Revenue - Skincare', name_th: 'รายได้ - ทรีตเมนต์ผิว', type: 'REVENUE', parent: '41000' },
  { code: '41050', name_en: 'Service Revenue - Body', name_th: 'รายได้ - ทรีตเมนต์รูปร่าง', type: 'REVENUE', parent: '41000' },
  { code: '41090', name_en: 'Service Revenue - Other', name_th: 'รายได้ - บริการอื่น', type: 'REVENUE', parent: '41000' },
  
  { code: '42000', name_en: 'Product Sales', name_th: 'รายได้ขายสินค้า', type: 'REVENUE', is_postable: false, parent: '40000' },
  { code: '42010', name_en: 'Product Sales - Skincare', name_th: 'ขายผลิตภัณฑ์ดูแลผิว', type: 'REVENUE', parent: '42000' },
  { code: '42020', name_en: 'Product Sales - Supplements', name_th: 'ขายอาหารเสริม', type: 'REVENUE', parent: '42000' },
  
  { code: '49000', name_en: 'Other Income', name_th: 'รายได้อื่น', type: 'REVENUE', is_postable: false, parent: '40000' },
  { code: '49010', name_en: 'Other Income', name_th: 'รายได้อื่น', type: 'REVENUE', parent: '49000' },
  
  // ═══════ 5xxxx COST OF SALES ═══════
  { code: '50000', name_en: 'Cost of Sales', name_th: 'ต้นทุนขายและบริการ', type: 'EXPENSE', is_postable: false },
  
  { code: '51000', name_en: 'Cost of Services', name_th: 'ต้นทุนบริการ', type: 'EXPENSE', is_postable: false, parent: '50000' },
  { code: '51010', name_en: 'Products Consumed', name_th: 'ต้นทุนผลิตภัณฑ์ที่ใช้', type: 'EXPENSE', parent: '51000' },
  { code: '51020', name_en: 'Doctor Commission', name_th: 'ค่านายหน้าแพทย์', type: 'EXPENSE', parent: '51000' },
  { code: '51030', name_en: 'Therapist Commission', name_th: 'ค่านายหน้าเทอราพิสต์', type: 'EXPENSE', parent: '51000' },
  
  { code: '52000', name_en: 'Inventory Variance', name_th: 'การปรับปรุงสินค้าคงเหลือ', type: 'EXPENSE', is_postable: false, parent: '50000' },
  { code: '52010', name_en: 'Inventory Loss - Damage', name_th: 'ขาดทุนจากสินค้าเสียหาย', type: 'EXPENSE', parent: '52000' },
  { code: '52020', name_en: 'Inventory Loss - Expired', name_th: 'ขาดทุนจากสินค้าหมดอายุ', type: 'EXPENSE', parent: '52000' },
  { code: '52030', name_en: 'Inventory Loss - Theft', name_th: 'ขาดทุนจากสินค้าสูญหาย', type: 'EXPENSE', parent: '52000' },
  { code: '52040', name_en: 'Inventory Variance - Count', name_th: 'ผลต่างจากการตรวจนับ', type: 'EXPENSE', parent: '52000' },
  
  // ═══════ 6xxxx OPERATING EXPENSES ═══════
  { code: '60000', name_en: 'Operating Expenses', name_th: 'ค่าใช้จ่ายดำเนินงาน', type: 'EXPENSE', is_postable: false },
  
  { code: '61000', name_en: 'Personnel', name_th: 'ค่าใช้จ่ายเกี่ยวกับบุคลากร', type: 'EXPENSE', is_postable: false, parent: '60000' },
  { code: '61010', name_en: 'Salary Expense', name_th: 'เงินเดือน', type: 'EXPENSE', parent: '61000' },
  { code: '61011', name_en: 'Wages', name_th: 'ค่าจ้าง', type: 'EXPENSE', parent: '61000' },
  { code: '61012', name_en: 'Social Security Expense', name_th: 'ประกันสังคม - นายจ้าง', type: 'EXPENSE', parent: '61000' },
  { code: '61013', name_en: 'Bonus & Incentive', name_th: 'โบนัส', type: 'EXPENSE', parent: '61000' },
  
  { code: '61100', name_en: 'Premises', name_th: 'ค่าใช้จ่ายเกี่ยวกับสถานที่', type: 'EXPENSE', is_postable: false, parent: '60000' },
  { code: '61110', name_en: 'Rent Expense', name_th: 'ค่าเช่า', type: 'EXPENSE', parent: '61100' },
  { code: '61120', name_en: 'Utilities - Electricity', name_th: 'ค่าไฟฟ้า', type: 'EXPENSE', parent: '61100' },
  { code: '61130', name_en: 'Utilities - Water', name_th: 'ค่าน้ำประปา', type: 'EXPENSE', parent: '61100' },
  { code: '61140', name_en: 'Utilities - Internet/Phone', name_th: 'ค่าอินเทอร์เน็ตและโทรศัพท์', type: 'EXPENSE', parent: '61100' },
  
  { code: '61200', name_en: 'Marketing', name_th: 'ค่าใช้จ่ายการตลาด', type: 'EXPENSE', is_postable: false, parent: '60000' },
  { code: '61210', name_en: 'Marketing - Online', name_th: 'การตลาดออนไลน์', type: 'EXPENSE', parent: '61200' },
  { code: '61220', name_en: 'Marketing - Offline', name_th: 'การตลาดออฟไลน์', type: 'EXPENSE', parent: '61200' },
  { code: '61230', name_en: 'Marketing - Influencer', name_th: 'อินฟลูเอนเซอร์', type: 'EXPENSE', parent: '61200' },
  
  { code: '61300', name_en: 'Banking', name_th: 'ค่าใช้จ่ายธนาคาร', type: 'EXPENSE', is_postable: false, parent: '60000' },
  { code: '61310', name_en: 'Bank Fees', name_th: 'ค่าธรรมเนียมธนาคาร', type: 'EXPENSE', parent: '61300' },
  { code: '61320', name_en: 'Card Processing Fees', name_th: 'ค่าธรรมเนียมบัตรเครดิต', type: 'EXPENSE', parent: '61300' },
  
  { code: '61400', name_en: 'Professional Services', name_th: 'ค่าบริการวิชาชีพ', type: 'EXPENSE', is_postable: false, parent: '60000' },
  { code: '61410', name_en: 'Accounting & Legal', name_th: 'ค่าบัญชีและกฎหมาย', type: 'EXPENSE', parent: '61400' },
  { code: '61420', name_en: 'Software & Subscriptions', name_th: 'ค่าซอฟต์แวร์', type: 'EXPENSE', parent: '61400' },
  
  { code: '61500', name_en: 'Other Expenses', name_th: 'ค่าใช้จ่ายอื่น', type: 'EXPENSE', is_postable: false, parent: '60000' },
  { code: '61510', name_en: 'Office Supplies', name_th: 'อุปกรณ์สำนักงาน', type: 'EXPENSE', parent: '61500' },
  { code: '61520', name_en: 'Travel & Transport', name_th: 'ค่าเดินทาง', type: 'EXPENSE', parent: '61500' },
  { code: '61530', name_en: 'Training & Development', name_th: 'ค่าฝึกอบรม', type: 'EXPENSE', parent: '61500' },
  { code: '61540', name_en: 'Depreciation Expense', name_th: 'ค่าเสื่อมราคา', type: 'EXPENSE', parent: '61500' },
  
  { code: '69010', name_en: 'Miscellaneous Expense', name_th: 'ค่าใช้จ่ายเบ็ดเตล็ด', type: 'EXPENSE', parent: '60000' },
];
```

## 2. Fiscal Periods (Static)

Generate 24 months: previous calendar year + current year + next year (to allow for advance posting).

```ts
// prisma/seed/periods.ts
export async function seedPeriods(prisma) {
  const currentYear = new Date().getFullYear();
  const periods = [];
  
  for (let year = currentYear - 1; year <= currentYear + 1; year++) {
    for (let month = 1; month <= 12; month++) {
      const code = `${year}-${String(month).padStart(2, '0')}`;
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));  // last day of month
      
      // Past periods (more than 2 months ago) → CLOSED
      // Recent past + current → OPEN
      const monthsAgo = (currentYear - year) * 12 + (new Date().getMonth() + 1 - month);
      const status = monthsAgo > 2 ? 'CLOSED' : 'OPEN';
      
      periods.push({ code, start_date: start, end_date: end, status });
    }
  }
  
  await prisma.fiscalPeriod.createMany({ data: periods, skipDuplicates: true });
}
```

## 3. Bank Accounts (Static)

```ts
export const BANK_ACCOUNTS = [
  {
    code: 'KBANK-001',
    name: 'KBank Current — 0123456789',
    bank_name: 'KBANK',
    account_number: '0123456789',
    account_type: 'current',
    gl_account_code: '11020',
  },
  {
    code: 'SCB-001',
    name: 'SCB Savings — 9876543210',
    bank_name: 'SCB',
    account_number: '9876543210',
    account_type: 'savings',
    gl_account_code: '11030',
  },
  {
    code: 'CASH-001',
    name: 'Cash on Hand',
    bank_name: 'CASH',
    account_type: 'current',
    gl_account_code: '11010',
  },
  {
    code: 'PETTY-001',
    name: 'Petty Cash',
    bank_name: 'CASH',
    account_type: 'current',
    gl_account_code: '11100',
  },
];
```

## 4. Users (Static)

Five seeded users for role demo:

```ts
export const USERS = [
  { email: 'admin@wind-clinic.com', name: 'Admin User', role: 'ADMIN' },
  { email: 'somchai@wind-clinic.com', name: 'สมชาย บัญชี', role: 'ACCOUNTANT' },
  { email: 'ratchada@wind-clinic.com', name: 'รัชดา การเงิน', role: 'ACCOUNTANT' },
  { email: 'manager-tl@wind-clinic.com', name: 'ผู้จัดการ ทองหล่อ', role: 'VIEWER' },
  { email: 'auditor@wind-clinic.com', name: 'External Auditor', role: 'VIEWER' },
];
```

## 5. Default Settings (Static)

```ts
export const DEFAULT_SETTINGS = {
  company: {
    name_en: 'WIND CLINIC Co., Ltd.',
    name_th: 'บริษัท วินด์ คลินิก จำกัด',
    tax_id: '0105566123456',
    address: 'XX/X ถนนสุขุมวิท กรุงเทพฯ 10110',
    phone: '02-XXX-XXXX',
    email: 'contact@wind-clinic.com',
    branches: [
      { code: 'TL',    name: 'ทองหล่อ',  branch_office: '00000', address: '...' },
      { code: 'EK',    name: 'เอกมัย',   branch_office: '00001', address: '...' },
      { code: 'RAMA9', name: 'พระราม 9', branch_office: '00002', address: '...' },
    ],
  },
  fiscal_year_start_month: 1,  // January
  default_vat_rate: 7,
  account_map: {
    wind_clinic_service_to_revenue: {
      'BOTOX_50U':  '41010',
      'BOTOX_100U': '41010',
      'FILLER_HA':  '41020',
      'LASER_IPL':  '41030',
      'LASER_FRACT':'41030',
      'FACIAL':     '41040',
      'PEEL':       '41040',
      'BODY_SLIM':  '41050',
      'DEFAULT':    '41090',
    },
    wind_clinic_product_to_revenue: {
      'DEFAULT': '42010',
    },
    wind_clinic_payment_to_bank: {
      'CASH':     'CASH-001',
      'TRANSFER': 'KBANK-001',
      'CREDIT_CARD':'KBANK-001',
      'DEBIT_CARD': 'KBANK-001',
      'QR':       'KBANK-001',
      'CHEQUE':   'KBANK-001',
    },
    card_fee_account: '61320',
    default_ar_account: '12010',
    default_ap_account: '21010',
    doctor_commission_account: '51020',
    doctor_commission_payable: '21030',
  },
  numbering: {
    JE: 'JE-{YYYY}-{NNNN}',
    INV: 'INV-{YYYY}-{NNNN}',
    TAX: 'TAX-{YYYY}-{NNNN}',
    RCT: 'RCT-{YYYY}-{NNNN}',
    BILL: 'BILL-{YYYY}-{NNNN}',
    PAY: 'PAY-{YYYY}-{NNNN}',
    PP30: 'PP30-{YYYY}-{MM}',
    PND3: 'PND3-{YYYY}-{MM}',
    PND53: 'PND53-{YYYY}-{MM}',
    WHT: 'WHT-{YYYY}-{NNNN}',
    CUST: 'CUST-{NNNN}',
    VEND: 'VEND-{NNNN}',
  },
};
```

## 6. Sample Customers (Optional, `--with-samples`)

Generate ~20 customers, mix of individuals and corporate:

```ts
export const SAMPLE_CUSTOMERS = [
  // Individuals (most common for clinic)
  { code: 'CUST-0001', name: 'Somchai Jaidee',     name_th: 'สมชาย ใจดี',    phone: '081-234-5678' },
  { code: 'CUST-0002', name: 'Lisa Manopong',     name_th: 'ลิซ่า มโนพงษ์',  phone: '082-345-6789' },
  { code: 'CUST-0003', name: 'Pim Wattana',        name_th: 'พิมพ์ วัฒนา',   phone: '083-456-7890' },
  // ... 15 more individuals
  
  // Corporate (with tax_id)
  { code: 'CUST-0020', name: 'ABC Corp Ltd.',      name_th: 'บริษัท เอบีซี จำกัด', tax_id: '0105566111111', payment_terms_days: 30 },
  { code: 'CUST-0021', name: 'XYZ Industries',     name_th: 'บริษัท เอ็กซ์วายซี อินดัสทรี', tax_id: '0105566222222', payment_terms_days: 30 },
];
```

## 7. Sample Vendors (Optional)

Mix of individual freelancers and companies:

```ts
export const SAMPLE_VENDORS = [
  // Goods suppliers (juristic)
  { code: 'VEND-0001', name: 'Allergan (Thailand) Ltd.', tax_id: '0105566333333', vendor_type: 'JURISTIC', default_ap_account_code: '21010', withholding_rates: {} },
  { code: 'VEND-0002', name: 'Galderma Thailand',         tax_id: '0105566444444', vendor_type: 'JURISTIC', default_ap_account_code: '21010', withholding_rates: {} },
  { code: 'VEND-0003', name: 'Skincare Distributor Co.',  tax_id: '0105566555555', vendor_type: 'JURISTIC', default_ap_account_code: '21010', withholding_rates: {} },
  
  // Service providers (juristic, withholding 3%)
  { code: 'VEND-0010', name: 'Marketing Agency 1',        tax_id: '0105566666666', vendor_type: 'JURISTIC', withholding_rates: { service: 3 } },
  { code: 'VEND-0011', name: 'IT Services Ltd.',          tax_id: '0105566777777', vendor_type: 'JURISTIC', withholding_rates: { service: 3 } },
  { code: 'VEND-0012', name: 'Cleaning Services Co.',     tax_id: '0105566888888', vendor_type: 'JURISTIC', withholding_rates: { service: 3 } },
  
  // Landlord (individual, withholding 5%)
  { code: 'VEND-0020', name: 'Landlord Mr. Suthep',       tax_id: '1234567890123', vendor_type: 'INDIVIDUAL', withholding_rates: { rent: 5 } },
  
  // Utilities (juristic, no withholding on goods)
  { code: 'VEND-0030', name: 'Metropolitan Electricity',  tax_id: '0994000123456', vendor_type: 'JURISTIC', withholding_rates: {} },
  { code: 'VEND-0031', name: 'Metropolitan Waterworks',   tax_id: '0994000234567', vendor_type: 'JURISTIC', withholding_rates: {} },
  { code: 'VEND-0032', name: 'AIS Corporate',             tax_id: '0107536000625', vendor_type: 'JURISTIC', withholding_rates: { service: 3 } },
  
  // Doctor freelancer (individual, withholding 3%)
  { code: 'VEND-0040', name: 'Dr. Niran Aesthetic',       tax_id: '3210987654321', vendor_type: 'INDIVIDUAL', withholding_rates: { service: 3 } },
];
```

## 8. Sample Transactions (Optional)

Generate 3 months of realistic transactions to populate reports.

### Strategy

For months `[currentMonth - 3, currentMonth - 2, currentMonth - 1, currentMonth]`:

1. **Opening JE** (only for the first month being seeded):
   ```
   Dr. KBank (11020)         500,000
   Dr. Cash (11010)           20,000
   Dr. Equipment (16011)     800,000
      Cr. Owner's Capital (31010)  1,320,000
   ```

2. **Per month, generate:**
   - 30-50 sales invoices (mix of services + products, varied amounts 1,500–25,000 THB)
   - Receipts for ~80% of those invoices (the rest stay open as AR)
   - 5-10 vendor bills (rent, utilities, supplies, marketing)
   - Payments for ~70% of bills
   - Salary JE on the 28th of each month
   - Bank txn import for KBank for the month (auto-reconciled to most receipts/payments)

3. **Tax filings:** generate ภพ.30 for each closed month, mark as SUBMITTED.

### Sample data generators

```ts
// prisma/seed/transactions.ts

const SERVICE_CATALOG = [
  { code: 'BOTOX_50U',  name: 'Botox 50 units',     price: 5350,  account: '41010' },
  { code: 'BOTOX_100U', name: 'Botox 100 units',    price: 9900,  account: '41010' },
  { code: 'FILLER_HA',  name: 'HA Filler 1cc',      price: 8500,  account: '41020' },
  { code: 'LASER_IPL',  name: 'IPL Photo Facial',   price: 3500,  account: '41030' },
  { code: 'LASER_FRACT',name: 'Fractional Laser',   price: 12000, account: '41030' },
  { code: 'FACIAL',     name: 'Hydra Facial',       price: 2500,  account: '41040' },
  { code: 'PEEL',       name: 'Chemical Peel',      price: 3000,  account: '41040' },
  { code: 'BODY_SLIM',  name: 'Body Slimming',      price: 6500,  account: '41050' },
];

const PAYMENT_DISTRIBUTION = [
  { method: 'CASH',         weight: 0.10 },
  { method: 'TRANSFER',     weight: 0.30 },
  { method: 'CREDIT_CARD',  weight: 0.45 },
  { method: 'QR',           weight: 0.15 },
];

const BRANCHES = ['TL', 'EK', 'RAMA9'];

// Use seedrandom for deterministic generation
import seedrandom from 'seedrandom';
const rng = seedrandom('wind-clinic-2026');

function pickWeighted<T>(items: { weight: number, value: T }[]): T { /* ... */ }

async function generateMonthOfActivity(prisma, monthCode: string) {
  // ... generates ~30 invoices, 25 receipts, 8 bills, 6 payments, salary JE, etc.
}
```

### Recurring expenses (every month)

| Vendor | Description | Account | Net | VAT | WHT | Frequency |
|---|---|---|---|---|---|---|
| Landlord | Rent — TL branch | 61110 | 80,000 | 5,600 | 4,000 (5%) | Monthly, 1st |
| Landlord | Rent — EK branch | 61110 | 60,000 | 4,200 | 3,000 | Monthly, 1st |
| Landlord | Rent — RAMA9 branch | 61110 | 70,000 | 4,900 | 3,500 | Monthly, 1st |
| MEA | Electricity | 61120 | 25,000 | 1,750 | - | Monthly, 5th |
| MWA | Water | 61130 | 4,500 | 315 | - | Monthly, 5th |
| AIS | Internet | 61140 | 8,000 | 560 | 240 (3%) | Monthly, 10th |
| Marketing Agency | Online ads | 61210 | 50,000 | 3,500 | 1,500 (3%) | Monthly, 15th |

### Salary JE (28th of each month)

```
Dr. Salary Expense (61010)         300,000
Dr. SSO Employer (61012)            15,000
   Cr. Cash/KBank                 285,000  (net to staff)
   Cr. WHT Payable (21120)         15,000  (employee WHT)
   Cr. SSO Payable                 15,000  (employee + employer side)
```

Simplified version OK for seed.

### Doctor commissions

For each clinic visit with `doctor_commission_pct`:
```
Dr. Doctor Commission (51020)
   Cr. Doctor Commission Payable (21030)
```

Paid monthly via separate Payment with WHT 3%.

## 9. Realistic Number Targets

After running `db:seed:full`, the system should have:

| Metric | Target |
|---|---|
| Posted JEs | ~600-800 |
| Sales Invoices | ~120-150 (40 per month × 3 months) |
| Receipts | ~100-120 |
| Open AR | ~20-30 invoices, 200K-400K THB total |
| Bills | ~30-40 |
| Payments | ~25-30 |
| Open AP | ~5-10 bills, 50K-150K THB |
| Bank txns (KBank) | ~150-200 (auto-imported, 90% reconciled) |
| Tax filings | 2 finalized PP30, 2 finalized PND53 |
| WHT certs | ~30-40 |

This gives reports something interesting to display.

## 10. Seed Script Skeleton

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { ACCOUNTS, BANK_ACCOUNTS, USERS, DEFAULT_SETTINGS } from './seed/static';
import { seedPeriods } from './seed/periods';
import { seedSampleCustomers, seedSampleVendors } from './seed/samples';
import { generateMonthOfActivity } from './seed/transactions';

const prisma = new PrismaClient();
const withSamples = process.argv.includes('--with-samples');

async function main() {
  console.log('🌱 Seeding accounts...');
  await prisma.account.createMany({ data: ACCOUNTS, skipDuplicates: true });
  
  console.log('🌱 Seeding fiscal periods...');
  await seedPeriods(prisma);
  
  console.log('🌱 Seeding bank accounts...');
  await prisma.bankAccount.createMany({ data: BANK_ACCOUNTS, skipDuplicates: true });
  
  console.log('🌱 Seeding users...');
  await prisma.user.createMany({ data: USERS, skipDuplicates: true });
  
  console.log('🌱 Seeding settings...');
  await seedSettings(prisma, DEFAULT_SETTINGS);
  
  if (withSamples) {
    console.log('🌱 Seeding sample customers and vendors...');
    await seedSampleCustomers(prisma);
    await seedSampleVendors(prisma);
    
    console.log('🌱 Generating 3 months of activity...');
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const date = subMonths(now, i);
      const monthCode = format(date, 'yyyy-MM');
      console.log(`  → ${monthCode}`);
      await generateMonthOfActivity(prisma, monthCode);
    }
    
    console.log('🌱 Generating tax filings...');
    await seedClosedTaxFilings(prisma);
    
    console.log('🌱 Importing mock bank transactions...');
    await seedBankTransactions(prisma);
  }
  
  console.log('✅ Seed complete');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

## 11. Reset & Re-seed

For developer convenience:

```bash
# Full reset (drops all data)
bun run db:reset && bun run db:seed:full

# Just static data (preserves any custom transactions)
bun run db:seed
```

The seed script must be **idempotent for static data** — running it twice doesn't duplicate accounts. Use `createMany` with `skipDuplicates`.

Sample data is **NOT idempotent** — running with `--with-samples` twice will generate two sets of transactions. This is fine; just `db:reset` first.
