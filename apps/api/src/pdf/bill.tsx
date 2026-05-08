import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YHZvTkc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVhJx26TKEr37c9aBz_ys8.ttf', fontWeight: 700 },
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

export type BillVendorInfo = {
  name: string;
  name_th?: string | null;
  tax_id?: string | null;
  address?: string | null;
  phone?: string | null;
};

export type BillLineData = {
  line_no: number;
  description: string;
  expense_account_code: string;
  qty: string;
  unit_price: string;
  vat_rate: string;
  withholding_rate: string;
  withholding_type: string | null;
  line_total: string;
};

export type BillPDFData = {
  bill_no: string;
  vendor_invoice_no?: string | null;
  branch_code: string;
  issue_date: Date;
  due_date: Date;
  vat_inclusive: boolean;
  subtotal: string;
  vat_amount: string;
  withholding_amount: string;
  total: string;
  net_payable: string;
  notes?: string | null;
  vendor: BillVendorInfo;
  company_name: string;
  company_tax_id: string;
  lines: BillLineData[];
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
    fontFamily: 'Sarabun',
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
  col_no: { width: '4%' },
  col_desc: { flex: 1 },
  col_acct: { width: '10%' },
  col_qty: { width: '8%', textAlign: 'right' },
  col_price: { width: '12%', textAlign: 'right' },
  col_vat: { width: '7%', textAlign: 'right' },
  col_wht: { width: '10%', textAlign: 'right' },
  col_total: { width: '12%', textAlign: 'right' },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  totalsBox: {
    width: 200,
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
  internalBadge: {
    padding: '3pt 8pt',
    backgroundColor: '#f5f0e8',
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: '#c9a96e',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  internalBadgeText: {
    fontSize: 8,
    color: '#8a6428',
    fontWeight: 700,
    letterSpacing: 0.5,
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

export function BillPDF({ data }: { data: BillPDFData }) {
  const netPayable = parseFloat(data.total) - parseFloat(data.withholding_amount);

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
            <Text style={S.docTitle}>ใบบันทึกค่าใช้จ่าย</Text>
            <Text style={S.docSubtitle}>Internal Expense Record · AP</Text>
            <Text style={S.docNo}>{data.bill_no}</Text>
          </View>
        </View>

        {/* Internal-use badge */}
        <View style={S.internalBadge}>
          <Text style={S.internalBadgeText}>สำหรับใช้ภายในเท่านั้น — INTERNAL COPY</Text>
        </View>

        {/* Meta grid */}
        <View style={S.metaGrid}>
          <View style={S.metaBox}>
            <Text style={S.metaLabel}>เจ้าหนี้ · Vendor</Text>
            <Text style={S.metaValue}>{data.vendor.name_th ?? data.vendor.name}</Text>
            {data.vendor.name_th && <Text style={S.metaValueSmall}>{data.vendor.name}</Text>}
            {data.vendor.tax_id && <Text style={S.metaValueSmall}>Tax ID: {data.vendor.tax_id}</Text>}
            {data.vendor.phone && <Text style={S.metaValueSmall}>{data.vendor.phone}</Text>}
            {data.vendor.address && <Text style={S.metaValueSmall}>{data.vendor.address}</Text>}
          </View>
          <View style={[S.metaBox, { flex: 0.6 }]}>
            <Text style={S.metaLabel}>เลขที่เอกสาร</Text>
            <Text style={[S.metaValue, { fontWeight: 700 }]}>{data.bill_no}</Text>
            {data.vendor_invoice_no && (
              <>
                <Text style={[S.metaLabel, { marginTop: 6 }]}>เลขที่ใบแจ้งหนี้ (เจ้าหนี้)</Text>
                <Text style={S.metaValue}>{data.vendor_invoice_no}</Text>
              </>
            )}
          </View>
          <View style={[S.metaBox, { flex: 0.5 }]}>
            <Text style={S.metaLabel}>วันที่รับ</Text>
            <Text style={S.metaValue}>{fmtDate(data.issue_date)}</Text>
            <Text style={[S.metaLabel, { marginTop: 6 }]}>วันครบกำหนด</Text>
            <Text style={S.metaValue}>{fmtDate(data.due_date)}</Text>
          </View>
        </View>

        {/* Lines table */}
        <View style={S.table}>
          <View style={S.tableHeader}>
            <Text style={[S.th, S.col_no]}>#</Text>
            <Text style={[S.th, S.col_desc]}>รายละเอียด</Text>
            <Text style={[S.th, S.col_acct]}>บัญชี</Text>
            <Text style={[S.th, S.col_qty]}>จำนวน</Text>
            <Text style={[S.th, S.col_price]}>ราคา/หน่วย</Text>
            <Text style={[S.th, S.col_vat]}>VAT%</Text>
            <Text style={[S.th, S.col_wht]}>WHT</Text>
            <Text style={[S.th, S.col_total]}>ยอดรวม</Text>
          </View>
          {data.lines.map((l) => (
            <View key={l.line_no} style={S.tableRow}>
              <Text style={[S.td, S.col_no, { color: '#999' }]}>{l.line_no}</Text>
              <Text style={[S.td, S.col_desc]}>{l.description}</Text>
              <Text style={[S.tdMono, S.col_acct, { color: '#b28a4a' }]}>{l.expense_account_code}</Text>
              <Text style={[S.tdMono, S.col_qty]}>
                {parseFloat(l.qty).toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </Text>
              <Text style={[S.tdMono, S.col_price]}>{fmtMoney(l.unit_price)}</Text>
              <Text style={[S.td, S.col_vat, { color: '#888' }]}>
                {parseFloat(l.vat_rate) === 7 ? '7%' : parseFloat(l.vat_rate) === 0 ? '0%' : 'Ext'}
              </Text>
              <Text style={[S.td, S.col_wht, { color: '#888' }]}>
                {parseFloat(l.withholding_rate) > 0 ? `${parseFloat(l.withholding_rate)}%` : '—'}
              </Text>
              <Text style={[S.tdMono, S.col_total]}>{fmtMoney(l.line_total)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={S.totalsContainer}>
          <View style={S.totalsBox}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>ราคาก่อน VAT</Text>
              <Text style={S.totalValue}>{fmtMoney(data.subtotal)}</Text>
            </View>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>VAT{data.vat_inclusive ? ' (รวมแล้ว)' : ' 7%'}</Text>
              <Text style={S.totalValue}>{fmtMoney(data.vat_amount)}</Text>
            </View>
            <View style={S.totalDivider} />
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>ยอดรวม</Text>
              <Text style={S.totalValue}>{fmtMoney(data.total)}</Text>
            </View>
            {parseFloat(data.withholding_amount) > 0 && (
              <View style={S.totalRow}>
                <Text style={[S.totalLabel, { color: '#c8a03c' }]}>หัก ณ ที่จ่าย (WHT)</Text>
                <Text style={[S.totalValue, { color: '#c8a03c' }]}>({fmtMoney(data.withholding_amount)})</Text>
              </View>
            )}
            <View style={S.totalDivider} />
            <View style={S.totalRow}>
              <Text style={S.totalNetLabel}>ยอดสุทธิที่ต้องชำระ</Text>
              <Text style={S.totalNetValue}>{fmtMoney(String(netPayable))}</Text>
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

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{data.company_name} · {data.company_tax_id}</Text>
          <Text style={S.footerText}>{data.bill_no} · Internal Record</Text>
        </View>
      </Page>
    </Document>
  );
}
