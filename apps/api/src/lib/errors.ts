const HTTP_STATUS_MAP = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PERIOD_NOT_OPEN: 409,
  PERIOD_NOT_FOUND: 404,
  PERIOD_CLOSE_BLOCKED: 409,
  PERIOD_LOCKED: 409,
  JE_NOT_BALANCED: 422,
  JE_NOT_DRAFT: 409,
  JE_NOT_POSTED: 409,
  ALREADY_VOIDED: 409,
  INVOICE_HAS_PAYMENTS: 409,
  BILL_HAS_PAYMENTS: 409,
  CUSTOMER_HAS_OPEN_INVOICES: 409,
  STALE_RECORD: 409,
  DUPLICATE_NUMBER: 409,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_NOT_POSTABLE: 422,
  ACCOUNT_INACTIVE: 422,
  INVALID_TAX_INVOICE: 422,
  WEBHOOK_SIGNATURE_INVALID: 401,
  IDEMPOTENT_REPLAY: 200,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof HTTP_STATUS_MAP;

export class BusinessRuleError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly context?: object;

  constructor(code: ErrorCode, context?: object) {
    super(code);
    this.name = 'BusinessRuleError';
    this.code = code;
    this.httpStatus = HTTP_STATUS_MAP[code];
    this.context = context;
  }
}

const STATIC_THAI: Partial<Record<ErrorCode, string>> = {
  UNAUTHORIZED: 'กรุณาเข้าสู่ระบบก่อน',
  FORBIDDEN: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้',
  NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
  VALIDATION_ERROR: 'ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  PERIOD_NOT_FOUND: 'ไม่พบงวดบัญชีที่ต้องการ',
  PERIOD_CLOSE_BLOCKED: 'ไม่สามารถปิดงวดได้ เนื่องจากรายการยังไม่ครบถ้วน',
  PERIOD_LOCKED: 'งวดบัญชีถูกล็อคแล้ว ไม่สามารถแก้ไขได้',
  JE_NOT_BALANCED: 'รายการไม่สมดุล ยอดเดบิตต้องเท่ากับเครดิต',
  JE_NOT_DRAFT: 'สมุดรายวันนี้ไม่ใช่ฉบับร่าง ไม่สามารถแก้ไขได้',
  JE_NOT_POSTED: 'สมุดรายวันนี้ยังไม่ได้บันทึก ไม่สามารถยกเลิกได้',
  ALREADY_VOIDED: 'สมุดรายวันนี้ถูกยกเลิกไปแล้ว',
  INVOICE_HAS_PAYMENTS: 'ใบแจ้งหนี้มีการรับชำระแล้ว ไม่สามารถยกเลิกได้',
  CUSTOMER_HAS_OPEN_INVOICES: 'ลูกค้ายังมีใบแจ้งหนี้ที่ค้างอยู่ ไม่สามารถลบได้',
  BILL_HAS_PAYMENTS: 'บิลมีการชำระเงินแล้ว ไม่สามารถยกเลิกได้',
  STALE_RECORD: 'ข้อมูลถูกแก้ไขโดยผู้ใช้รายอื่น กรุณาโหลดข้อมูลใหม่',
  DUPLICATE_NUMBER: 'เลขที่เอกสารซ้ำกัน',
  ACCOUNT_NOT_FOUND: 'ไม่พบบัญชีที่ต้องการ',
  ACCOUNT_NOT_POSTABLE: 'บัญชีนี้เป็นบัญชีหัวข้อ ไม่สามารถลงรายการได้',
  ACCOUNT_INACTIVE: 'บัญชีนี้ถูกระงับการใช้งานแล้ว',
  INVALID_TAX_INVOICE: 'ข้อมูลใบกำกับภาษีไม่ครบถ้วน',
  WEBHOOK_SIGNATURE_INVALID: 'ลายเซ็นต์ Webhook ไม่ถูกต้อง',
  IDEMPOTENT_REPLAY: 'รายการนี้ดำเนินการไปแล้ว ส่งคืนผลเดิม',
  INTERNAL_ERROR: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
};

export function getThaiMessage(code: ErrorCode, context?: object): string {
  if (code === 'PERIOD_NOT_OPEN') {
    const periodCode = (context as { period_code?: string } | undefined)?.period_code;
    return periodCode
      ? `งวด ${periodCode} ปิดแล้ว ไม่สามารถลงรายการได้`
      : 'งวดบัญชีปิดแล้ว ไม่สามารถลงรายการได้';
  }
  return STATIC_THAI[code] ?? code;
}
