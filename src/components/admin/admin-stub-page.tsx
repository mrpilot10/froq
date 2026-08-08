import { StubPanel } from "@/components/admin/admin-charts";

export function AdminStubPage({
  title,
  description,
  needs,
}: {
  title: string;
  description: string;
  needs: string[];
}) {
  return <StubPanel title={title} description={description} needs={needs} />;
}
