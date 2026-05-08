"use client";

import { useRouter } from "next/navigation";
import { InvoiceForm, type InvoiceSubmitValues } from "@/components/ar/invoice-form";
import { apiClient } from "@/lib/api-client";

interface CreatedInvoice {
  id: string;
  invoice_no: string | null;
}

function buildApiPayload(values: InvoiceSubmitValues) {
  const payload: Record<string, unknown> = {
    customer_id: values.customer_id,
    branch_code: values.branch_code,
    issue_date: values.issue_date,
    due_date: values.due_date,
    is_tax_invoice: values.is_tax_invoice,
    vat_inclusive: values.vat_inclusive,
    notes: values.notes || undefined,
    lines: values.lines,
  };
  if (values.source_ref) payload.source_ref = values.source_ref;
  return payload;
}

export default function NewInvoicePage() {
  const router = useRouter();

  async function handleSaveDraft(values: InvoiceSubmitValues) {
    const invoice = await apiClient.post<CreatedInvoice>(
      "/api/v1/sales-invoices",
      buildApiPayload(values)
    );
    router.push(`/ar/invoices/${invoice.id}`);
  }

  async function handlePost(values: InvoiceSubmitValues) {
    const invoice = await apiClient.post<CreatedInvoice>(
      "/api/v1/sales-invoices",
      buildApiPayload(values)
    );
    await apiClient.post(`/api/v1/sales-invoices/${invoice.id}/post`, {});
    router.push(`/ar/invoices/${invoice.id}`);
  }

  return (
    <InvoiceForm
      onSaveDraft={handleSaveDraft}
      onPost={handlePost}
      onCancel={() => router.push("/ar/invoices")}
    />
  );
}
