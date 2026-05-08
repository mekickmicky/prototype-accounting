import { ReconcileWorkspace } from "@/components/bank/reconcile-workspace";

interface Props {
  params: Promise<{ account_id: string }>;
}

export default async function BankReconcilePage({ params }: Props) {
  const { account_id } = await params;
  return <ReconcileWorkspace accountId={account_id} />;
}
