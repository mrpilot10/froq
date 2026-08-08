import { InfraProviderPage } from "@/components/admin/infra-provider-page";
import { getVercelInfrastructure } from "@/lib/admin/infrastructure";

export default async function Page() {
  const data = await getVercelInfrastructure();
  return <InfraProviderPage data={data} />;
}
