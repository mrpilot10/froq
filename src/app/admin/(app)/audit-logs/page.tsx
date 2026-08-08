import { AdminStubPage } from "@/components/admin/admin-stub-page";

export default function Page() {
  return (
    <AdminStubPage
      title='Audit Logs'
      description='Admin actions, permission and plan changes.'
      needs={[
    'platform_audit_log table',
    'Actor + before/after diffs',
    'Retention policy',
  ]}
    />
  );
}
