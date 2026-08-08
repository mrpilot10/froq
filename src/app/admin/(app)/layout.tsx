import { AdminShell } from "@/components/admin/admin-shell";
import {
  formatApitxtBalance,
  getApitxtBalance,
  isApitxtBalanceLow,
} from "@/lib/admin/apitxt-balance";
import {
  formatResendQuotaChip,
  getResendQuota,
  isResendQuotaLow,
} from "@/lib/admin/resend-quota";
import { requireSuperAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [admin, apitxt, resend] = await Promise.all([
    requireSuperAdmin(),
    getApitxtBalance(),
    getResendQuota(),
  ]);

  return (
    <AdminShell
      email={admin.email}
      apitxtBalanceLabel={formatApitxtBalance(apitxt)}
      apitxtBalanceError={apitxt.error}
      apitxtBalanceLow={isApitxtBalanceLow(apitxt)}
      resendQuotaLabel={formatResendQuotaChip(resend)}
      resendQuotaError={resend.error}
      resendQuotaLow={isResendQuotaLow(resend)}
    >
      {children}
    </AdminShell>
  );
}
