import { AdminStubPage } from "@/components/admin/admin-stub-page";

export default function Page() {
  return (
    <AdminStubPage
      title='Security'
      description='Login failures, OTP abuse, Turnstile and blocked IPs.'
      needs={[
    'Auth audit table',
    'Rate-limit logs',
    'Turnstile challenge metrics',
  ]}
    />
  );
}
