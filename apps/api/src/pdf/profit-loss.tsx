import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { PLResult } from '../lib/reports/profit-loss';
import type { ReportRow, ReportSection } from '../lib/reports/common';

Font.register({
  family: 'Sarabun',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YHZvTkc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/sarabun/v15/DtVhJx26TKEr37c9aBz_ys8.ttf', fontWeight: 700 },
  ],
});

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function fmtDateBE(d: Date): string {
  const bkk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day = bkk.getDate();
  const month = bkk.getMonth();
  const year = bkk.getFullYear() + 543;
  return `${day} ${THAI_MONTHS[month]} ${year}`;
}

function fmtMoney(val: string): string {
  const isNeg = val.startsWith('-');
  const abs = isNeg ? val.slice(1) : val;
  const [intRaw, dec] = abs.split('.');
  const intPart = (intRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = (dec ?? '00').padEnd(2, '0').slice(0, 2);
  const formatted = `${intPart}.${decPart}`;
  if (formatted === '0.00') return '—';
  return isNeg ? `(${formatted})` : formatted;
}

function fmtPct(val: string | undefined): string {
  if (!val) return '—';
  const n = parseFloat(val);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

const HAS_COMPARATIVE = (result: PLResult) => result.comparative !== undefined;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Sarabun' },

  header: { marginBottom: 16 },
  companyName: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  reportTitle: { fontSize: 11, marginBottom: 2 },
  periodLine: { fontSize: 9, color: '#666666' },

  colCode: { width: '10%' },
  colName: { width: '42%' },
  colAmt: { width: '16%', textAlign: 'right' },
  colAmtWide: { width: '14%', textAlign: 'right' }, // comparative mode
  colPct: { width: '10%', textAlign: 'right' },     // comparative mode

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },

  sectionHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    marginTop: 6,
  },
  sectionTitle: { fontWeight: 'bold', fontSize: 9 },

  dataRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottom: '0.5 solid #e5e7eb',
  },

  subtotalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTop: '0.5 solid #9ca3af',
    fontWeight: 'bold',
  },

  derivedRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTop: '1 solid #111827',
    borderBottom: '1 solid #111827',
    marginTop: 6,
    marginBottom: 2,
    fontWeight: 'bold',
    backgroundColor: '#f9fafb',
  },

  netIncomeRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTop: '2 solid #111827',
    borderBottom: '2 solid #111827',
    marginTop: 8,
    fontWeight: 'bold',
    fontSize: 10,
    backgroundColor: '#f3f4f6',
  },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 4,
  },
});

interface SectionProps {
  section: ReportSection;
  comparative: boolean;
}

function SectionBlock({ section, comparative }: SectionProps) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.colCode, styles.sectionTitle]}> </Text>
        <Text style={[comparative ? styles.colName : styles.colName, styles.sectionTitle]}>
          {section.title_en} / {section.title_th}
        </Text>
      </View>

      {section.rows.map((row: ReportRow) => (
        <View key={row.account_code} style={styles.dataRow}>
          <Text style={styles.colCode}>{row.account_code}</Text>
          <Text style={comparative ? { width: '42%' } : styles.colName}>
            {row.name_en}
          </Text>
          {comparative ? (
            <>
              <Text style={styles.colAmtWide}>{fmtMoney(row.amount)}</Text>
              <Text style={styles.colAmtWide}>{fmtMoney(row.comparative_amount ?? '0.00')}</Text>
              <Text style={styles.colPct}>{fmtPct(row.pct_change)}</Text>
            </>
          ) : (
            <Text style={styles.colAmt}>{fmtMoney(row.amount)}</Text>
          )}
        </View>
      ))}

      <View style={styles.subtotalRow}>
        <Text style={styles.colCode}> </Text>
        <Text style={comparative ? { width: '42%' } : styles.colName}>
          Total {section.title_en}
        </Text>
        {comparative ? (
          <>
            <Text style={styles.colAmtWide}>{fmtMoney(section.total)}</Text>
            <Text style={styles.colAmtWide}>{fmtMoney(section.comparative_total ?? '0.00')}</Text>
            <Text style={styles.colPct}>{fmtPct(section.pct_change)}</Text>
          </>
        ) : (
          <Text style={styles.colAmt}>{fmtMoney(section.total)}</Text>
        )}
      </View>
    </View>
  );
}

interface DerivedRowProps {
  label: string;
  amount: string;
  comparativeAmount?: string;
  comparative: boolean;
  style?: object;
}

function DerivedLine({ label, amount, comparativeAmount, comparative, style }: DerivedRowProps) {
  const rowStyle = style ?? styles.derivedRow;
  return (
    <View style={rowStyle}>
      <Text style={styles.colCode}> </Text>
      <Text style={comparative ? { width: '42%' } : styles.colName}>{label}</Text>
      {comparative ? (
        <>
          <Text style={styles.colAmtWide}>{fmtMoney(amount)}</Text>
          <Text style={styles.colAmtWide}>{fmtMoney(comparativeAmount ?? '0.00')}</Text>
          <Text style={styles.colPct}> </Text>
        </>
      ) : (
        <Text style={styles.colAmt}>{fmtMoney(amount)}</Text>
      )}
    </View>
  );
}

export function ProfitLossPDF({ result }: { result: PLResult }) {
  const comparative = HAS_COMPARATIVE(result);
  const prior = result.comparative;

  const periodStr = `${fmtDateBE(result.start_date)} — ${fmtDateBE(result.end_date)}`;
  const priorPeriodStr = prior
    ? `  |  Comparative: ${fmtDateBE(prior.start_date)} — ${fmtDateBE(prior.end_date)}`
    : '';

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>WIND CLINIC</Text>
          <Text style={styles.reportTitle}>
            Profit & Loss Statement / งบกำไรขาดทุน
          </Text>
          <Text style={styles.periodLine}>
            Period: {periodStr}
            {priorPeriodStr}
            {result.branch !== 'ALL' ? `  |  Branch: ${result.branch}` : ''}
          </Text>
        </View>

        {/* Column headers */}
        <View style={styles.tableHeaderRow}>
          <Text style={styles.colCode}>Code</Text>
          <Text style={comparative ? { width: '42%' } : styles.colName}>Account</Text>
          {comparative ? (
            <>
              <Text style={styles.colAmtWide}>Current</Text>
              <Text style={styles.colAmtWide}>Prior</Text>
              <Text style={styles.colPct}>% Chg</Text>
            </>
          ) : (
            <Text style={styles.colAmt}>Amount</Text>
          )}
        </View>

        {/* Revenue */}
        <SectionBlock section={result.revenue} comparative={comparative} />

        {/* COGS */}
        <SectionBlock section={result.cogs} comparative={comparative} />

        {/* Gross Profit */}
        <DerivedLine
          label="GROSS PROFIT / กำไรขั้นต้น"
          amount={result.gross_profit}
          comparativeAmount={prior?.gross_profit}
          comparative={comparative}
        />

        {/* Operating Expenses */}
        <SectionBlock section={result.opex} comparative={comparative} />

        {/* Operating Income */}
        <DerivedLine
          label="OPERATING INCOME / กำไรจากการดำเนินงาน"
          amount={result.operating_income}
          comparativeAmount={prior?.operating_income}
          comparative={comparative}
        />

        {/* Other Income / (Expense) */}
        <SectionBlock section={result.other} comparative={comparative} />

        {/* Net Income */}
        <DerivedLine
          label="NET INCOME (BEFORE TAX) / กำไรสุทธิ (ก่อนภาษี)"
          amount={result.net_income}
          comparativeAmount={prior?.net_income}
          comparative={comparative}
          style={styles.netIncomeRow}
        />

        {/* Footer */}
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
