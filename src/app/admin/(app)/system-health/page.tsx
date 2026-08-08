import { AdminStubPage } from "@/components/admin/admin-stub-page";

export default function Page() {
  return (
    <AdminStubPage
      title='System Health'
      description='API errors, crons, webhooks, queue workers.'
      needs={[
    'Cron run ledger',
    'Webhook retry queue',
    'Error budget burn',
  ]}
    />
  );
}
