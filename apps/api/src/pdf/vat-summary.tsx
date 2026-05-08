import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { VatSummaryResult, VatSummaryRow } from '../lib/reports/vat-summary';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YHZvTkc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVhJx26TKEr37c9aBz_ys8.ttf', fontWeight: 700 },
  ],
});

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: '#16a34a',
  FINALIZED: '#2563eb',
  DRAFT: '#d97706',
  UNFILED: '#9ca3af',
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: 'Sarabun' },
  header: { marginBottom: 12 },
  companyName: { fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 10, marginBottom: 2 },
  periodLine: { fontSize: 8, color: '#666666' },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 8,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },
  altRow: {
    backgroundColor: '#f9fafb',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 7,
    color: '#9ca3af',
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 3,
  },
  colPeriod: { width: '9%' },
  colMoney: { width: '10%', textAlign: 'right' },
  colCount: { width: '6%', textAlign: 'right' },
  colPosition: { width: '8%', textAlign: 'center' },
  colStatus: { width: '9%', textAlign: 'center' },
  colFiling: { width: '14%' },
});

function fmtMoney(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '—';
  if (n < 0) return `(${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PeriodRow({ row, idx }: { row: VatSummaryRow; idx: number }) {
  const statusColor = STATUS_COLORS[row.status] ?? '#9ca3af';
  return (
    <View style={[styles.dataRow, idx % 2 === 1 ? styles.altRow : {}]}>
      <Text style={styles.colPeriod}>{row.period_code}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.output_vat)}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.taxable_sales)}</Text>
      <Text style={styles.colCount}>{row.output_count}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.input_vat)}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.total_purchases)}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.non_claimable_vat)}</Text>
      <Text style={[styles.colMoney, { fontWeight: 'bold' }]}>{fmtMoney(row.vat_payable)}</Text>
      <Text style={[styles.colPosition, { color: row.vat_position === 'REFUNDABLE' ? '#2563eb' : row.vat_position === 'PAYABLE' ? '#dc2626' : '#6b7280' }]}>
        {row.vat_position}
      </Text>
      <Text style={[styles.colStatus, { color: statusColor }]}>{row.status}</Text>
      <Text style={styles.colFiling}>{row.filing_no ?? '—'}</Text>
    </View>
  );
}

export function VatSummaryPDF({ result }: { result: VatSummaryResult }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>VAT Summary Report / รายงานสรุปภาษีมูลค่าเพิ่ม</Text>
          <Text style={styles.periodLine}>
            Period: {result.period_from} to {result.period_to}
          </Text>
        </View>

        <View style={styles.tableHeaderRow}>
          <Text style={styles.colPeriod}>Period</Text>
          <Text style={styles.colMoney}>Output VAT</Text>
          <Text style={styles.colMoney}>Taxable Sales</Text>
          <Text style={styles.colCount}>Out #</Text>
          <Text style={styles.colMoney}>Input VAT</Text>
          <Text style={styles.colMoney}>Purchases</Text>
          <Text style={styles.colMoney}>Non-Claim</Text>
          <Text style={styles.colMoney}>VAT Payable</Text>
          <Text style={styles.colPosition}>Position</Text>
          <Text style={styles.colStatus}>Status</Text>
          <Text style={styles.colFiling}>Filing No</Text>
        </View>

        {result.rows.map((row, idx) => (
          <PeriodRow key={row.period_code} row={row} idx={idx} />
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}  |  Generated: ${new Date().toISOString().slice(0, 10)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
