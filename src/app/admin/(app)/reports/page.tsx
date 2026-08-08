import { AdminStubPage } from "@/components/admin/admin-stub-page";

export default function Page() {
  return (
    <AdminStubPage
      title='Reports'
      description='CSV / Excel / PDF exports with filters.'
      needs={[
    'Report job queue',
    'Excel/PDF exporters',
    'Saved report presets',
  ]}
    />
  );
}
