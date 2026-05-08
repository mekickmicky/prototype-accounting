import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { CashPositionResult, CashPositionRow } from '../lib/reports/cash-position';

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
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },
  altRow: { backgroundColor: '#f9fafb' },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1 solid #374151',
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
  },
  summarySection: { marginTop: 16, borderTop: '1 solid #e5e7eb', paddingTop: 10 },
  summaryRow: { flexDirection: 'row', paddingVertical: 2 },
  summaryLabel: { width: '60%', color: '#374151' },
  summaryValue: { width: '40%', textAlign: 'right', fontWeight: 'bold' },
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
  colCode: { width: '8%' },
  colName: { width: '22%' },
  colBank: { width: '14%' },
  colMoney: { width: '12%', textAlign: 'right' },
  colDate: { width: '12%', textAlign: 'center' },
  colCount: { width: '8%', textAlign: 'right' },
});

function fmtMoney(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (n < 0) return `(${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  if (n === 0) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AccountRow({ row, idx }: { row: CashPositionRow; idx: number }) {
  return (
    <View style={[styles.dataRow, idx % 2 === 1 ? styles.altRow : {}]}>
      <Text style={styles.colCode}>{row.bank_account_code}</Text>
      <Text style={styles.colName}>{row.bank_account_name}</Text>
      <Text style={styles.colBank}>{row.bank_name}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.opening_balance)}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.total_in)}</Text>
      <Text style={styles.colMoney}>{fmtMoney(row.total_out)}</Text>
      <Text style={[styles.colMoney, { fontWeight: 'bold' }]}>{fmtMoney(row.closing_balance)}</Text>
      <Text style={styles.colDate}>{row.last_reconciled_date ?? '—'}</Text>
      <Text style={[styles.colCount, { color: row.unmatched_count > 0 ? '#dc2626' : '#6b7280' }]}>
        {row.unmatched_count || '—'}
      </Text>
    </View>
  );
}

export function CashPositionPDF({ result }: { result: CashPositionResult }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>Cash Position Report / รายงานฐานะเงินสด</Text>
          <Text style={styles.asOfLine}>
            As of: {result.as_of.toISOString().slice(0, 10)} | Branch: {result.branch}
          </Text>
        </View>

        <View style={styles.tableHeaderRow}>
          <Text style={styles.colCode}>Code</Text>
          <Text style={styles.colName}>Account Name</Text>
          <Text style={styles.colBank}>Bank</Text>
          <Text style={styles.colMoney}>Opening</Text>
          <Text style={styles.colMoney}>Total In</Text>
          <Text style={styles.colMoney}>Total Out</Text>
          <Text style={styles.colMoney}>Closing</Text>
          <Text style={styles.colDate}>Last Recon</Text>
          <Text style={styles.colCount}>Unmatched</Text>
        </View>

        {result.rows.map((row, idx) => (
          <AccountRow key={row.bank_account_id} row={row} idx={idx} />
        ))}

        <View style={styles.totalsRow}>
          <Text style={styles.colCode} />
          <Text style={styles.colName}>GRAND TOTAL</Text>
          <Text style={styles.colBank} />
          <Text style={styles.colMoney}>{fmtMoney(result.totals.opening_balance)}</Text>
          <Text style={styles.colMoney}>{fmtMoney(result.totals.total_in)}</Text>
          <Text style={styles.colMoney}>{fmtMoney(result.totals.total_out)}</Text>
          <Text style={styles.colMoney}>{fmtMoney(result.totals.closing_balance)}</Text>
          <Text style={styles.colDate} />
          <Text style={styles.colCount} />
        </View>

        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Cash & Bank Closing Balance</Text>
            <Text style={styles.summaryValue}>{fmtMoney(result.totals.closing_balance)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>+ Receivables (AR)</Text>
            <Text style={styles.summaryValue}>{fmtMoney(result.receivables)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>− Payables (AP)</Text>
            <Text style={[styles.summaryValue, { color: '#dc2626' }]}>({fmtMoney(result.payables)})</Text>
          </View>
          <View style={[styles.summaryRow, { borderTop: '0.5 solid #9ca3af', marginTop: 3, paddingTop: 3 }]}>
            <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>Projected Net Cash</Text>
            <Text style={[styles.summaryValue, { color: parseFloat(result.projected_net_cash) >= 0 ? '#16a34a' : '#dc2626' }]}>
              {fmtMoney(result.projected_net_cash)}
            </Text>
          </View>
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
