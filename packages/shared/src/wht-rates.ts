import { D, Decimal } from "./money";

export type VendorType = "INDIVIDUAL" | "JURISTIC";

export type WhtKey =
  | "services"
  | "goods"
  | "rent"
  | "transportation"
  | "professional"
  | "interest"
  | "royalties"
  | "advertising";

export interface WhtRateEntry {
  key: WhtKey;
  label_th: string;
  rate_individual: string;
  rate_juristic: string;
  rd_code: string;
}

export const WHT_RATES: WhtRateEntry[] = [
  {
    key: "services",
    label_th: "ค่าจ้างทำของ / ค่าบริการ",
    rate_individual: "3",
    rate_juristic: "3",
    rd_code: "(2)",
  },
  {
    key: "goods",
    label_th: "ค่าซื้อสินค้า",
    rate_individual: "0",
    rate_juristic: "0",
    rd_code: "—",
  },
  {
    key: "rent",
    label_th: "ค่าเช่า",
    rate_individual: "5",
    rate_juristic: "5",
    rd_code: "(7)",
  },
  {
    key: "transportation",
    label_th: "ค่าขนส่ง",
    rate_individual: "1",
    rate_juristic: "1",
    rd_code: "(8)",
  },
  {
    key: "professional",
    label_th: "ค่าวิชาชีพอิสระ",
    rate_individual: "3",
    rate_juristic: "3",
    rd_code: "(6)",
  },
  {
    key: "interest",
    label_th: "ดอกเบี้ย",
    rate_individual: "1",
    rate_juristic: "1",
    rd_code: "(4)",
  },
  {
    key: "royalties",
    label_th: "ค่าลิขสิทธิ์ / ค่าสิทธิ",
    rate_individual: "3",
    rate_juristic: "3",
    rd_code: "(3)",
  },
  {
    key: "advertising",
    label_th: "ค่าโฆษณา",
    rate_individual: "2",
    rate_juristic: "2",
    rd_code: "(2)",
  },
];

export const WHT_THRESHOLD: Decimal = D("1000");

const _rateMap = new Map<string, WhtRateEntry>(
  WHT_RATES.map((e) => [e.key, e])
);

export function lookupRate(key: WhtKey, vendor_type: VendorType): Decimal {
  const entry = _rateMap.get(key);
  if (!entry) throw new Error(`Unknown WHT key: ${key}`);
  return vendor_type === "INDIVIDUAL"
    ? D(entry.rate_individual)
    : D(entry.rate_juristic);
}
