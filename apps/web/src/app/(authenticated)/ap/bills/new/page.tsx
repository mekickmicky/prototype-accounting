"use client";

import { useRouter } from "next/navigation";
import { BillForm, type BillSubmitValues } from "@/components/ap/bill-form";
import { apiClient } from "@/lib/api-client";

interface CreatedBill {
  id: string;
  bill_no: string | null;
}

function buildApiPayload(values: BillSubmitValues) {
  return {
    vendor_id: values.vendor_id,
    vendor_invoice_no: values.vendor_invoice_no || undefined,
    branch_code: values.branch_code,
    issue_date: values.issue_date,
    due_date: values.due_date,
    vat_inclusive: values.vat_inclusive,
    notes: values.notes || undefined,
    lines: values.lines,
  };
}

export default function NewBillPage() {
  const router = useRouter();

  async function handleSaveDraft(values: BillSubmitValues) {
    const bill = await apiClient.post<CreatedBill>("/api/v1/bills", buildApiPayload(values));
    router.push(`/ap/bills/${bill.id}`);
  }

  async function handlePost(values: BillSubmitValues) {
    const bill = await apiClient.post<CreatedBill>("/api/v1/bills", buildApiPayload(values));
    await apiClient.post(`/api/v1/bills/${bill.id}/post`, {});
    router.push(`/ap/bills/${bill.id}`);
  }

  return (
    <BillForm
      onSaveDraft={handleSaveDraft}
      onPost={handlePost}
      onCancel={() => router.push("/ap/bills")}
    />
  );
}
