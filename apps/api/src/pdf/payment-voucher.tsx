import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9WBI.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5sulw.ttf', fontWeight: 700 },
  ],
});

function fmtMoney(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export type PaymentVoucherBillRow = {
  bill_no: string;
  bill_date: Date;
  original_amount: string;
  paid_amount: string;
};

export type PaymentVoucherData = {
  payment_no: string;
  payment_date: Date;
  branch_code: string;
  payment_method: string;
  cheque_no?: string | null;
  notes?: string | null;
  total_amount: string;
  withholding_total: string;
  net_paid: string;
  vendor_name: string;
  vendor_name_th?: string | null;
  vendor_tax_id?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  company_name: string;
  company_tax_id: string;
  bills: PaymentVoucherBillRow[];
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด (Cash)',
  BANK_TRANSFER: 'โอนเงิน (Bank Transfer)',
  CHEQUE: 'เช็ค (Cheque)',
};

const S = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 9,
    color: '#1a1a1a',
    padding: '28pt 36pt',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  companyName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#222',
    marginBottom: 2,
  },
  companyMeta: {
    fontSize: 8,
    color: '#666',
    marginBottom: 1,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#b28a4a',
    textAlign: 'right',
    marginBottom: 3,
  },
  docSubtitle: {
    fontSize: 8,
    color: '#888',
    textAlign: 'right',
    marginBottom: 1,
  },
  docNo: {
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'right',
    color: '#333',
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  metaBox: {
    flex: 1,
    padding: '8pt 10pt',
    backgroundColor: '#f8f8f8',
    borderRadius: 3,
  },
  metaLabel: {
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#888',
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 9,
    color: '#222',
  },
  metaValueSmall: {
    fontSize: 8,
    color: '#555',
    marginTop: 1,
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ececec',
  },
  th: {
    fontSize: 7,
    fontWeight: 700,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  td: {
    fontSize: 9,
    color: '#333',
  },
  tdMono: {
    fontSize: 8,
    fontFamily: 'Sarabun',
    color: '#333',
  },
  col_bill_no: { width: '25%' },
  col_bill_date: { width: '20%' },
  col_original: { width: '27%', textAlign: 'right' },
  col_paid: { width: '28%', textAlign: 'right' },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  totalsBox: {
    width: 220,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalLabel: {
    fontSize: 9,
    color: '#555',
  },
  totalValue: {
    fontSize: 9,
    color: '#333',
    fontFamily: 'Sarabun',
  },
  totalDivider: {
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    marginVertical: 3,
  },
  totalNetLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#222',
  },
  totalNetValue: {
    fontSize: 10,
    fontWeight: 700,
    color: '#b28a4a',
    fontFamily: 'Sarabun',
  },
  signatoryRow: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 40,
  },
  signatoryBox: {
    flex: 1,
    borderTopWidth: 0.5,
    borderTopColor: '#888',
    paddingTop: 6,
  },
  signatoryLabel: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
  },
  notesBox: {
    marginTop: 12,
    padding: '6pt 8pt',
    backgroundColor: '#fafafa',
    borderRadius: 3,
    borderLeftWidth: 2,
    borderLeftColor: '#e0e0e0',
  },
  notesLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 9,
    color: '#555',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#aaa',
  },
});

export function PaymentVoucherPDF({ data }: { data: PaymentVoucherData }) {
  const hasWht = parseFloat(data.withholding_total) > 0;
  const methodLabel = PAYMENT_METHOD_LABELS[data.payment_method] ?? data.payment_method;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.companyName}>{data.company_name}</Text>
            <Text style={S.companyMeta}>เลขประจำตัวผู้เสียภาษี: {data.company_tax_id}</Text>
            <Text style={S.companyMeta}>สาขา: {data.branch_code}</Text>
          </View>
          <View>
            <Text style={S.docTitle}>ใบสำคัญจ่าย</Text>
            <Text style={S.docSubtitle}>Payment Voucher · AP</Text>
            <Text style={S.docNo}>{data.payment_no}</Text>
          </View>
        </View>

        {/* Meta grid */}
        <View style={S.metaGrid}>
          <View style={S.metaBox}>
            <Text style={S.metaLabel}>เจ้าหนี้ · Vendor</Text>
            <Text style={S.metaValue}>{data.vendor_name_th ?? data.vendor_name}</Text>
            {data.vendor_name_th && <Text style={S.metaValueSmall}>{data.vendor_name}</Text>}
            {data.vendor_tax_id && <Text style={S.metaValueSmall}>Tax ID: {data.vendor_tax_id}</Text>}
          </View>
          <View style={[S.metaBox, { flex: 0.65 }]}>
            <Text style={S.metaLabel}>เลขที่เอกสาร</Text>
            <Text style={[S.metaValue, { fontWeight: 700 }]}>{data.payment_no}</Text>
            <Text style={[S.metaLabel, { marginTop: 6 }]}>วันที่จ่าย</Text>
            <Text style={S.metaValue}>{fmtDate(data.payment_date)}</Text>
          </View>
          <View style={[S.metaBox, { flex: 0.55 }]}>
            <Text style={S.metaLabel}>วิธีชำระเงิน</Text>
            <Text style={S.metaValue}>{methodLabel}</Text>
            {data.cheque_no && (
              <>
                <Text style={[S.metaLabel, { marginTop: 6 }]}>เลขที่เช็ค</Text>
                <Text style={S.metaValue}>{data.cheque_no}</Text>
              </>
            )}
            {data.bank_account_name && (
              <>
                <Text style={[S.metaLabel, { marginTop: 6 }]}>บัญชีธนาคาร</Text>
                <Text style={S.metaValue}>{data.bank_account_name}</Text>
                {data.bank_account_no && (
                  <Text style={S.metaValueSmall}>{data.bank_account_no}</Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* Bills table */}
        <View style={S.table}>
          <View style={S.tableHeader}>
            <Text style={[S.th, S.col_bill_no]}>เลขที่ใบวางบิล</Text>
            <Text style={[S.th, S.col_bill_date]}>วันที่</Text>
            <Text style={[S.th, S.col_original]}>ยอดใบวางบิล</Text>
            <Text style={[S.th, S.col_paid]}>ยอดชำระ</Text>
          </View>
          {data.bills.map((row, idx) => (
            <View key={idx} style={S.tableRow}>
              <Text style={[S.tdMono, S.col_bill_no, { color: '#b28a4a' }]}>{row.bill_no}</Text>
              <Text style={[S.td, S.col_bill_date]}>{fmtDate(row.bill_date)}</Text>
              <Text style={[S.tdMono, S.col_original]}>{fmtMoney(row.original_amount)}</Text>
              <Text style={[S.tdMono, S.col_paid]}>{fmtMoney(row.paid_amount)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={S.totalsContainer}>
          <View style={S.totalsBox}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>ยอดรวมชำระ</Text>
              <Text style={S.totalValue}>{fmtMoney(data.total_amount)}</Text>
            </View>
            {hasWht && (
              <View style={S.totalRow}>
                <Text style={[S.totalLabel, { color: '#c8a03c' }]}>หัก ณ ที่จ่าย (WHT)</Text>
                <Text style={[S.totalValue, { color: '#c8a03c' }]}>({fmtMoney(data.withholding_total)})</Text>
              </View>
            )}
            <View style={S.totalDivider} />
            <View style={S.totalRow}>
              <Text style={S.totalNetLabel}>ยอดเงินสุทธิ</Text>
              <Text style={S.totalNetValue}>{fmtMoney(data.net_paid)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={S.notesBox}>
            <Text style={S.notesLabel}>หมายเหตุ</Text>
            <Text style={S.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* Signatory lines */}
        <View style={S.signatoryRow}>
          <View style={S.signatoryBox}>
            <Text style={S.signatoryLabel}>ผู้จัดทำ / Prepared by</Text>
          </View>
          <View style={S.signatoryBox}>
            <Text style={S.signatoryLabel}>ผู้อนุมัติ / Approved by</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{data.company_name} · {data.company_tax_id}</Text>
          <Text style={S.footerText}>{data.payment_no} · Payment Voucher</Text>
        </View>
      </Page>
    </Document>
  );
}
