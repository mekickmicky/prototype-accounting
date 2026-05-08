import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { ApAgingResult, AgingVendorRow } from '../lib/reports/ap-aging';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YHZvTkc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVhJx26TKEr37c9aBz_ys8.ttf', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: 'Sarabun' },
  header: { marginBottom: 12 },
  companyName: { fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 10, marginBottom: 2 },
  asOfLine: { fontSize: 8, color: '#666666' },
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
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1 solid #111827',
    borderBottom: '2 solid #111827',
    marginTop: 4,
    fontWeight: 'bold',
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
  colVendor:  { width: '28%' },
  colCurrent: { width: '12%', textAlign: 'right' },
  colB1_30:   { width: '12%', textAlign: 'right' },
  colB31_60:  { width: '12%', textAlign: 'right' },
  colB61_90:  { width: '12%', textAlign: 'right' },
  colB90plus: { width: '12%', textAlign: 'right' },
  colTotal:   { width: '12%', textAlign: 'right' },
  totalsLabel: { width: '28%', fontWeight: 'bold' },
});

function fmtMoney(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VendorRow({ row }: { row: AgingVendorRow }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.colVendor}>{row.vendor_code} {row.vendor_name}</Text>
      <Text style={styles.colCurrent}>{fmtMoney(row.current)}</Text>
      <Text style={styles.colB1_30}>{fmtMoney(row.b1_30)}</Text>
      <Text style={styles.colB31_60}>{fmtMoney(row.b31_60)}</Text>
      <Text style={styles.colB61_90}>{fmtMoney(row.b61_90)}</Text>
      <Text style={styles.colB90plus}>{fmtMoney(row.b90plus)}</Text>
      <Text style={styles.colTotal}>{fmtMoney(row.total)}</Text>
    </View>
  );
}

export function ApAgingPDF({ result }: { result: ApAgingResult }) {
  const asOfStr =
    result.as_of instanceof Date
      ? result.as_of.toISOString().slice(0, 10)
      : String(result.as_of);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>AP Aging Report / รายงานอายุเจ้าหนี้</Text>
          <Text style={styles.asOfLine}>
            As of: {asOfStr}
            {result.branch !== 'ALL' ? `  |  Branch: ${result.branch}` : ''}
          </Text>
        </View>

        <View style={styles.tableHeaderRow}>
          <Text style={styles.colVendor}>Vendor</Text>
          <Text style={styles.colCurrent}>Current</Text>
          <Text style={styles.colB1_30}>1-30 Days</Text>
          <Text style={styles.colB31_60}>31-60 Days</Text>
          <Text style={styles.colB61_90}>61-90 Days</Text>
          <Text style={styles.colB90plus}>90+ Days</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>

        {result.rows.map(row => (
          <VendorRow key={row.vendor_id} row={row} />
        ))}

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>TOTAL</Text>
          <Text style={styles.colCurrent}>{fmtMoney(result.totals.current)}</Text>
          <Text style={styles.colB1_30}>{fmtMoney(result.totals.b1_30)}</Text>
          <Text style={styles.colB31_60}>{fmtMoney(result.totals.b31_60)}</Text>
          <Text style={styles.colB61_90}>{fmtMoney(result.totals.b61_90)}</Text>
          <Text style={styles.colB90plus}>{fmtMoney(result.totals.b90plus)}</Text>
          <Text style={styles.colTotal}>{fmtMoney(result.totals.total)}</Text>
        </View>

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
