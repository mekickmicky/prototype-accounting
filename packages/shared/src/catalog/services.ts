export type VatRate = '7' | '0' | 'EXEMPT';

export type ServiceCategory =
  | 'BOTOX'
  | 'FILLER'
  | 'LASER'
  | 'SKINCARE'
  | 'BODY'
  | 'PRODUCT'
  | 'OTHER';

export interface CatalogService {
  code: string;
  name_th: string;
  name_en: string;
  /** VAT-exclusive unit price as a Decimal string (e.g. "5000.00") */
  default_unit_price: string;
  /** Must match a postable account in the Chart of Accounts */
  default_revenue_account_code: string;
  default_vat_rate: VatRate;
  category: ServiceCategory;
}

export const CLINIC_SERVICES: CatalogService[] = [
  // ── Botox ────────────────────────────────────────────────────────────
  {
    code: 'BOTOX_50U',
    name_th: 'โบท็อกซ์ 50 ยูนิต',
    name_en: 'Botox 50 Units',
    default_unit_price: '5000.00',
    default_revenue_account_code: '41010',
    default_vat_rate: '7',
    category: 'BOTOX',
  },
  {
    code: 'BOTOX_100U',
    name_th: 'โบท็อกซ์ 100 ยูนิต',
    name_en: 'Botox 100 Units',
    default_unit_price: '9000.00',
    default_revenue_account_code: '41010',
    default_vat_rate: '7',
    category: 'BOTOX',
  },
  {
    code: 'BOTOX_JAW',
    name_th: 'โบท็อกซ์กราม',
    name_en: 'Jaw Botox (Masseter)',
    default_unit_price: '3500.00',
    default_revenue_account_code: '41010',
    default_vat_rate: '7',
    category: 'BOTOX',
  },

  // ── Filler ───────────────────────────────────────────────────────────
  {
    code: 'FILLER_HA',
    name_th: 'ฟิลเลอร์ HA 1 ซีซี',
    name_en: 'HA Filler 1cc',
    default_unit_price: '8000.00',
    default_revenue_account_code: '41020',
    default_vat_rate: '7',
    category: 'FILLER',
  },
  {
    code: 'FILLER_NOSE',
    name_th: 'ฟิลเลอร์เสริมจมูก',
    name_en: 'Nose Filler',
    default_unit_price: '10000.00',
    default_revenue_account_code: '41020',
    default_vat_rate: '7',
    category: 'FILLER',
  },
  {
    code: 'FILLER_LIPS',
    name_th: 'ฟิลเลอร์เพิ่มริมฝีปาก',
    name_en: 'Lip Filler',
    default_unit_price: '7500.00',
    default_revenue_account_code: '41020',
    default_vat_rate: '7',
    category: 'FILLER',
  },

  // ── Laser ─────────────────────────────────────────────────────────────
  {
    code: 'LASER_IPL',
    name_th: 'เลเซอร์ IPL โฟโตเฟเชียล',
    name_en: 'IPL Photofacial',
    default_unit_price: '3500.00',
    default_revenue_account_code: '41030',
    default_vat_rate: '7',
    category: 'LASER',
  },
  {
    code: 'LASER_FRACT',
    name_th: 'Fractional เลเซอร์',
    name_en: 'Fractional Laser',
    default_unit_price: '12000.00',
    default_revenue_account_code: '41030',
    default_vat_rate: '7',
    category: 'LASER',
  },
  {
    code: 'LASER_PICO',
    name_th: 'พิโกเลเซอร์',
    name_en: 'Pico Laser',
    default_unit_price: '8000.00',
    default_revenue_account_code: '41030',
    default_vat_rate: '7',
    category: 'LASER',
  },

  // ── Skincare Treatments ──────────────────────────────────────────────
  {
    code: 'FACIAL_HYDRA',
    name_th: 'ไฮดราฟาเชียล',
    name_en: 'Hydra Facial',
    default_unit_price: '2500.00',
    default_revenue_account_code: '41040',
    default_vat_rate: '7',
    category: 'SKINCARE',
  },
  {
    code: 'PEEL_CHEM',
    name_th: 'เคมีพีล',
    name_en: 'Chemical Peel',
    default_unit_price: '3000.00',
    default_revenue_account_code: '41040',
    default_vat_rate: '7',
    category: 'SKINCARE',
  },

  // ── Body ─────────────────────────────────────────────────────────────
  {
    code: 'BODY_SLIM',
    name_th: 'ทรีตเมนต์ลดไขมัน',
    name_en: 'Body Slimming Treatment',
    default_unit_price: '6500.00',
    default_revenue_account_code: '41050',
    default_vat_rate: '7',
    category: 'BODY',
  },

  // ── Other Services ────────────────────────────────────────────────────
  {
    code: 'THREAD_LIFT',
    name_th: 'ร้อยไหมกระชับผิว',
    name_en: 'Thread Lift',
    default_unit_price: '15000.00',
    default_revenue_account_code: '41090',
    default_vat_rate: '7',
    category: 'OTHER',
  },
  {
    code: 'VITAMIN_DRIP',
    name_th: 'วิตามินทางหลอดเลือดดำ',
    name_en: 'Vitamin IV Drip',
    default_unit_price: '3500.00',
    default_revenue_account_code: '41090',
    default_vat_rate: '7',
    category: 'OTHER',
  },
  {
    code: 'CONSULTATION',
    name_th: 'ค่าปรึกษาแพทย์',
    name_en: 'Medical Consultation',
    default_unit_price: '500.00',
    default_revenue_account_code: '41090',
    default_vat_rate: '7',
    category: 'OTHER',
  },

  // ── Products ──────────────────────────────────────────────────────────
  {
    code: 'PROD_SKINCARE',
    name_th: 'ผลิตภัณฑ์ดูแลผิว',
    name_en: 'Skincare Product',
    default_unit_price: '1200.00',
    default_revenue_account_code: '42010',
    default_vat_rate: '7',
    category: 'PRODUCT',
  },
  {
    code: 'PROD_SUPPLEMENT',
    name_th: 'อาหารเสริม',
    name_en: 'Dietary Supplement',
    default_unit_price: '800.00',
    default_revenue_account_code: '42020',
    default_vat_rate: '7',
    category: 'PRODUCT',
  },
];

/** Lookup a single service by its code. Returns undefined if not found. */
export function findService(code: string): CatalogService | undefined {
  return CLINIC_SERVICES.find((s) => s.code === code);
}
