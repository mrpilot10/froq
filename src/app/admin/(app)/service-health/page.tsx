import { AdminStubPage } from "@/components/admin/admin-stub-page";

export default function Page() {
  return (
    <AdminStubPage
      title='Service Health'
      description='Upstream dependency status for core providers.'
      needs={[
    'Synthetic uptime checks',
    'Incident timeline',
    'Latency SLOs',
  ]}
    />
  );
}
