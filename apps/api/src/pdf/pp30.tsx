import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { PP30Aggregate, VatRegisterRow } from '../lib/tax/pp30-aggregate';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9WBI.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5sulw.ttf', fontWeight: 700 },
  ],
});

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmtDateThai(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear() + 543;
  return `${day} ${THAI_MONTHS[month]} ${year}`;
}

function fmtPeriodThai(period_code: string): string {
  const [yearStr, monthStr] = period_code.split('-');
  const month = parseInt(monthStr ?? '1', 10) - 1;
  const year = parseInt(yearStr ?? '2025', 10) + 543;
  return `${THAI_MONTHS[month]} ${year}`;
}

function fmtMoney(val: string): string {
  const isNeg = val.startsWith('-');
  const abs = isNeg ? val.slice(1) : val;
  const [intRaw, dec] = abs.split('.');
  const intPart = (intRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = (dec ?? '00').padEnd(2, '0').slice(0, 2);
  return `${isNeg ? '-' : ''}${intPart}.${decPart}`;
}

const ACCENT = '#9f5f6a';
const DARK = '#1f2937';
const GRAY = '#6b7280';
const LIGHT_BG = '#f9fafb';
const BORDER = '#e5e7eb';
const STRIPE = '#fdf2f4';
const POSITIVE_BG = '#fef2f2';
const REFUND_BG = '#f0fdf4';

export type PP30Data = {
  aggregate: PP30Aggregate;
  filing_no: string;
  issuer: {
    name_en: string;
    name_th: string;
    tax_id: string;
    branch_office: string;
    address: string;
  };
  carry_forward_credit?: string;
  printed_at?: Date;
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: 'Sarabun', color: DARK },

  titleBlock: { alignItems: 'center', marginBottom: 12 },
  titleMain: { fontSize: 15, fontWeight: 'bold', color: DARK, marginBottom: 2 },
  titleSub: { fontSize: 9, color: GRAY, marginBottom: 2 },
  titleRef: { fontSize: 8, color: ACCENT, fontWeight: 'bold' },

  divider: { borderBottom: '0.5 solid ' + BORDER, marginBottom: 10, marginTop: 4 },

  headerRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  headerBox: {
    flex: 1,
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderLeft: '3 solid ' + ACCENT,
  },
  headerLabel: { fontSize: 6, color: GRAY, marginBottom: 3, fontWeight: 'bold' },
  headerName: { fontSize: 9, fontWeight: 'bold', marginBottom: 1 },
  headerDetail: { fontSize: 7, color: GRAY, marginBottom: 1 },

  periodBox: {
    width: '35%',
    backgroundColor: LIGHT_BG,
    padding: 8,
    borderLeft: '3 solid ' + ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: { fontSize: 6, color: GRAY, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  periodValue: { fontSize: 13, fontWeight: 'bold', color: DARK, textAlign: 'center' },

  sectionTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: DARK,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  sectionBox: {
    borderLeft: '0.5 solid ' + BORDER,
    borderRight: '0.5 solid ' + BORDER,
    borderBottom: '0.5 solid ' + BORDER,
    marginBottom: 8,
  },

  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottom: '0.5 solid ' + BORDER,
  },
  sectionRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sectionKey: { fontSize: 8, color: DARK },
  sectionKeyGray: { fontSize: 7, color: GRAY },
  sectionVal: { fontSize: 9, fontWeight: 'bold', textAlign: 'right' },
  sectionValAccent: { fontSize: 9, fontWeight: 'bold', color: ACCENT, textAlign: 'right' },

  vatPayableBox: {
    backgroundColor: POSITIVE_BG,
    borderLeft: '3 solid #ef4444',
    padding: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vatRefundBox: {
    backgroundColor: REFUND_BG,
    borderLeft: '3 solid #22c55e',
    padding: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vatPayableLabel: { fontSize: 8, fontWeight: 'bold', color: DARK },
  vatPayableAmount: { fontSize: 13, fontWeight: 'bold', color: '#ef4444' },
  vatRefundAmount: { fontSize: 13, fontWeight: 'bold', color: '#16a34a' },

  carryForwardBox: {
    borderLeft: '0.5 solid ' + BORDER,
    borderRight: '0.5 solid ' + BORDER,
    borderBottom: '0.5 solid ' + BORDER,
    marginBottom: 12,
  },

  signatureSection: { flexDirection: 'row', marginTop: 20, justifyContent: 'space-between' },
  signatureBox: { width: '30%', alignItems: 'center' },
  signatureLine: { borderTop: '0.5 solid ' + DARK, width: '100%', marginBottom: 4 },
  signatureLabel: { fontSize: 6, color: GRAY, textAlign: 'center' },

  footer: {
    position: 'absolute',
    bottom: 18,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 6,
    color: GRAY,
    borderTop: '0.5 solid ' + BORDER,
    paddingTop: 3,
  },

  attachPageTitle: { fontSize: 11, fontWeight: 'bold', color: DARK, marginBottom: 2 },
  attachPageSub: { fontSize: 8, color: GRAY, marginBottom: 8 },
  attachBadge: {
    fontSize: 7,
    color: '#ffffff',
    backgroundColor: ACCENT,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },

  table: {
    borderTop: '0.5 solid ' + BORDER,
    borderLeft: '0.5 solid ' + BORDER,
    borderRight: '0.5 solid ' + BORDER,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: DARK,
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    fontSize: 6.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid ' + BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tableRowStripe: {
    flexDirection: 'row',
    borderBottom: '0.5 solid ' + BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: STRIPE,
  },
  grandTotal: {
    flexDirection: 'row',
    backgroundColor: DARK,
    color: '#ffffff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
  },

  colNo: { width: 22, textAlign: 'center' },
  colDate: { width: 68, textAlign: 'center' },
  colInvoiceNo: { width: 88, textAlign: 'center' },
  colCounterparty: { flex: 1, paddingRight: 4 },
  colTaxId: { width: 82, textAlign: 'center' },
  colNet: { width: 72, textAlign: 'right' },
  colRate: { width: 36, textAlign: 'right' },
  colVat: { width: 72, textAlign: 'right' },
});

function AttachTableHeader({ isInput }: { isInput: boolean }) {
  return (
    <View style={styles.tableHeaderRow}>
      <Text style={styles.colNo}>#</Text>
      <Text style={styles.colDate}>วันที่ / Date</Text>
      <Text style={styles.colInvoiceNo}>เลขที่ใบกำกับภาษี</Text>
      <Text style={styles.colCounterparty}>
        {isInput ? 'ผู้ขาย / Vendor' : 'ลูกค้า / Customer'}
      </Text>
      <Text style={styles.colTaxId}>เลขผู้เสียภาษี</Text>
      <Text style={styles.colNet}>ยอดก่อนภาษี (฿)</Text>
      <Text style={styles.colRate}>อัตรา</Text>
      <Text style={styles.colVat}>ภาษีมูลค่าเพิ่ม (฿)</Text>
    </View>
  );
}

function AttachTableRows({ rows, isInput }: { rows: VatRegisterRow[]; isInput: boolean }) {
  return (
    <>
      {rows.map((row, i) => {
        const rowStyle = i % 2 === 1 ? styles.tableRowStripe : styles.tableRow;
        return (
          <View key={row.id} style={rowStyle}>
            <Text style={styles.colNo}>{i + 1}</Text>
            <Text style={styles.colDate}>{fmtDateThai(row.txn_date)}</Text>
            <Text style={styles.colInvoiceNo}>{row.tax_invoice_no ?? '—'}</Text>
            <Text style={styles.colCounterparty}>{row.counterparty_name}</Text>
            <Text style={styles.colTaxId}>{row.counterparty_tax_id ?? '—'}</Text>
            <Text style={styles.colNet}>{fmtMoney(row.net_amount)}</Text>
            <Text style={styles.colRate}>{parseFloat(row.vat_rate).toFixed(0)}%</Text>
            <Text style={styles.colVat}>{fmtMoney(row.vat_amount)}</Text>
          </View>
        );
      })}
    </>
  );
}

function AttachPage({
  rows,
  isInput,
  filing_no,
  period_code,
  total_vat,
  issuer_name,
  printDate,
}: {
  rows: VatRegisterRow[];
  isInput: boolean;
  filing_no: string;
  period_code: string;
  total_vat: string;
  issuer_name: string;
  printDate: Date;
}) {
  const titleTh = isInput
    ? 'ภาคผนวก ข — รายการใบกำกับภาษีซื้อ (Input VAT)'
    : 'ภาคผนวก ก — รายการใบกำกับภาษีขาย (Output VAT)';
  const titleEn = isInput
    ? 'ATTACHMENT B — PURCHASE TAX INVOICES (INPUT VAT)'
    : 'ATTACHMENT A — SALES TAX INVOICES (OUTPUT VAT)';
  const totalLabel = isInput ? 'รวมภาษีซื้อ (Input VAT)' : 'รวมภาษีขาย (Output VAT)';

  const sumNet = rows
    .reduce((acc, r) => acc + parseFloat(r.net_amount), 0)
    .toFixed(2);

  return (
    <Page size="A4" orientation="portrait" style={styles.page}>
      <Text style={styles.attachPageTitle}>{titleTh}</Text>
      <Text style={styles.attachPageSub}>{titleEn}</Text>
      <Text style={styles.attachBadge}>
        {filing_no}  —  งวด {fmtPeriodThai(period_code)}  —  {rows.length} รายการ
      </Text>

      <View style={styles.table}>
        <AttachTableHeader isInput={isInput} />
        <AttachTableRows rows={rows} isInput={isInput} />
        <View style={styles.grandTotal}>
          <Text style={styles.colNo} />
          <Text style={styles.colDate} />
          <Text style={styles.colInvoiceNo} />
          <Text style={{ ...styles.colCounterparty, color: '#ffffff' }}>
            รวม / TOTAL ({rows.length} รายการ)
          </Text>
          <Text style={styles.colTaxId} />
          <Text style={{ ...styles.colNet, color: '#ffffff' }}>{fmtMoney(sumNet)}</Text>
          <Text style={styles.colRate} />
          <Text style={{ ...styles.colVat, color: '#ffffff' }}>{fmtMoney(total_vat)}</Text>
        </View>
      </View>

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `${issuer_name}  |  ภพ.30 ${filing_no}  |  งวด ${fmtPeriodThai(period_code)}  |  ${titleEn}  |  หน้า ${pageNumber}/${totalPages}  |  พิมพ์: ${printDate.toISOString().slice(0, 10)}`
        }
        fixed
      />
    </Page>
  );
}

export function PP30PDF({ data }: { data: PP30Data }) {
  const { aggregate, filing_no, issuer, carry_forward_credit, printed_at } = data;
  const printDate = printed_at ?? new Date();
  const vatPayableNum = parseFloat(aggregate.vat_payable);
  const isPayable = vatPayableNum > 0;
  const isRefund = vatPayableNum < 0;

  const carryForward = carry_forward_credit ?? '0.00';
  const carryForwardNum = parseFloat(carryForward);

  const allInputRows = [...aggregate.input_rows, ...aggregate.non_claimable_rows];

  return (
    <Document>
      {/* Page 1: Summary */}
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleMain}>ภพ.30 — แบบแสดงรายการภาษีมูลค่าเพิ่ม</Text>
          <Text style={styles.titleSub}>PP30 — VALUE ADDED TAX MONTHLY RETURN</Text>
          <Text style={styles.titleRef}>เลขที่ {filing_no}</Text>
        </View>

        <View style={styles.divider} />

        {/* Header: issuer info + period */}
        <View style={styles.headerRow}>
          <View style={styles.headerBox}>
            <Text style={styles.headerLabel}>ผู้ยื่น / FILER</Text>
            <Text style={styles.headerName}>{issuer.name_en}</Text>
            <Text style={{ fontSize: 8, marginBottom: 1 }}>{issuer.name_th}</Text>
            <Text style={styles.headerDetail}>{issuer.address}</Text>
            <Text style={styles.headerDetail}>
              เลขประจำตัวผู้เสียภาษี: {issuer.tax_id}
            </Text>
            <Text style={styles.headerDetail}>
              รหัสสาขา: {issuer.branch_office}
            </Text>
          </View>
          <View style={styles.periodBox}>
            <Text style={styles.periodLabel}>งวดภาษี / TAX PERIOD</Text>
            <Text style={styles.periodValue}>{fmtPeriodThai(aggregate.period_code)}</Text>
            <Text style={{ fontSize: 6, color: GRAY, marginTop: 4, textAlign: 'center' }}>
              {aggregate.period_code}
            </Text>
          </View>
        </View>

        {/* Section 1: Output VAT */}
        <Text style={styles.sectionTitle}>ส่วนที่ 1 — ภาษีขาย (Output VAT)</Text>
        <View style={styles.sectionBox}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionKeyGray}>จำนวนใบกำกับภาษีขาย / No. of sales invoices</Text>
            <Text style={styles.sectionVal}>{aggregate.output_rows.length} ฉบับ</Text>
          </View>
          <View style={styles.sectionRowLast}>
            <Text style={styles.sectionKey}>ยอดภาษีขาย / Output VAT</Text>
            <Text style={styles.sectionVal}>{fmtMoney(aggregate.output_vat)} บาท</Text>
          </View>
        </View>

        {/* Section 2: Input VAT */}
        <Text style={styles.sectionTitle}>ส่วนที่ 2 — ภาษีซื้อ (Input VAT)</Text>
        <View style={styles.sectionBox}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionKeyGray}>จำนวนใบกำกับภาษีซื้อ (ขอคืน) / Claimable invoices</Text>
            <Text style={styles.sectionVal}>{aggregate.input_rows.length} ฉบับ</Text>
          </View>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionKeyGray}>จำนวนใบกำกับภาษีซื้อ (ไม่ขอคืน) / Non-claimable invoices</Text>
            <Text style={{ ...styles.sectionVal, color: GRAY }}>
              {aggregate.non_claimable_rows.length} ฉบับ
            </Text>
          </View>
          <View style={styles.sectionRowLast}>
            <Text style={styles.sectionKey}>ยอดภาษีซื้อที่ขอหักได้ / Claimable Input VAT</Text>
            <Text style={styles.sectionValAccent}>{fmtMoney(aggregate.input_vat)} บาท</Text>
          </View>
        </View>

        {/* Section 3: VAT Payable / Refundable */}
        <Text style={styles.sectionTitle}>ส่วนที่ 3 — ภาษีที่ต้องชำระ / คืน (Net VAT)</Text>
        <View style={styles.sectionBox}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionKeyGray}>ภาษีขาย / Output VAT</Text>
            <Text style={styles.sectionVal}>{fmtMoney(aggregate.output_vat)} บาท</Text>
          </View>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionKeyGray}>หัก ภาษีซื้อ / Less Input VAT</Text>
            <Text style={styles.sectionValAccent}>({fmtMoney(aggregate.input_vat)}) บาท</Text>
          </View>
          <View style={styles.sectionRowLast}>
            <Text style={{ ...styles.sectionKey, fontWeight: 'bold' }}>
              {isPayable ? 'ภาษีที่ต้องชำระ / VAT PAYABLE' : isRefund ? 'ภาษีที่ขอคืน / VAT REFUNDABLE' : 'ยอดสุทธิ / NET'}
            </Text>
            <Text style={{
              ...styles.sectionVal,
              color: isPayable ? '#ef4444' : isRefund ? '#16a34a' : DARK,
              fontSize: 11,
            }}>
              {fmtMoney(aggregate.vat_payable)} บาท
            </Text>
          </View>
        </View>

        {isPayable && (
          <View style={styles.vatPayableBox}>
            <Text style={styles.vatPayableLabel}>ยอดภาษีที่ต้องนำส่ง RD / AMOUNT DUE TO REVENUE DEPARTMENT</Text>
            <Text style={styles.vatPayableAmount}>{fmtMoney(aggregate.vat_payable)} บาท</Text>
          </View>
        )}
        {isRefund && (
          <View style={styles.vatRefundBox}>
            <Text style={styles.vatPayableLabel}>ยอดภาษีที่ขอคืน / VAT REFUND REQUESTED</Text>
            <Text style={styles.vatRefundAmount}>{fmtMoney(aggregate.vat_payable)} บาท</Text>
          </View>
        )}

        {/* Section 4: Carry-forward credit */}
        <Text style={styles.sectionTitle}>ส่วนที่ 4 — เครดิตยกมา (Carry-Forward Credit)</Text>
        <View style={styles.carryForwardBox}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionKeyGray}>เครดิตภาษีซื้อยกมาจากงวดก่อน / Credit b/f from prior period</Text>
            <Text style={styles.sectionVal}>{fmtMoney(carryForward)} บาท</Text>
          </View>
          <View style={styles.sectionRowLast}>
            <Text style={styles.sectionKeyGray}>
              {carryForwardNum > 0
                ? 'ใช้เครดิตยกมาหักภาษีที่ต้องชำระ / Applied carry-forward credit'
                : 'ไม่มีเครดิตยกมา / No carry-forward credit'}
            </Text>
            <Text style={{ ...styles.sectionVal, color: GRAY }}>
              {carryForwardNum > 0 ? `(${fmtMoney(carryForward)}) บาท` : '—'}
            </Text>
          </View>
        </View>

        {/* Signature */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ลายมือชื่อ / Authorized Signatory</Text>
            <Text style={{ fontSize: 6, color: GRAY, textAlign: 'center', marginTop: 2 }}>
              {issuer.name_en}
            </Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ตำแหน่ง / Position</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>วันที่ยื่น / Submission Date</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${issuer.name_en}  |  ภพ.30 ${filing_no}  |  งวด ${fmtPeriodThai(aggregate.period_code)}  |  หน้า ${pageNumber}/${totalPages}  |  พิมพ์: ${printDate.toISOString().slice(0, 10)}`
          }
          fixed
        />
      </Page>

      {/* Attachment A: Output VAT invoices */}
      {aggregate.output_rows.length > 0 && (
        <AttachPage
          rows={aggregate.output_rows}
          isInput={false}
          filing_no={filing_no}
          period_code={aggregate.period_code}
          total_vat={aggregate.output_vat}
          issuer_name={issuer.name_en}
          printDate={printDate}
        />
      )}

      {/* Attachment B: Input VAT invoices (claimable + non-claimable) */}
      {allInputRows.length > 0 && (
        <AttachPage
          rows={allInputRows}
          isInput={true}
          filing_no={filing_no}
          period_code={aggregate.period_code}
          total_vat={aggregate.input_vat}
          issuer_name={issuer.name_en}
          printDate={printDate}
        />
      )}
    </Document>
  );
}
