import { AdminStubPage } from "@/components/admin/admin-stub-page";

export default function Page() {
  return (
    <AdminStubPage
      title='SMS'
      description='OTP, utility and marketing SMS performance.'
      needs={[
    'DLT template analytics',
    'Failure taxonomy',
    'Cost by route',
  ]}
    />
  );
}
