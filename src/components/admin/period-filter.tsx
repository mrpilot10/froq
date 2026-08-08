import Link from "next/link";
import {
  ADMIN_PERIODS,
  type AdminPeriod,
} from "@/lib/admin/period";

const LABELS: Record<AdminPeriod, string> = {
  "7d": "7d",
  "30d": "30d",
  "6m": "6m",
  "1y": "1y",
  all: "All",
};

/**
 * Server-friendly period tabs via `?range=` query. Preserves other search params.
 */
export function PeriodFilter({
  pathname,
  period,
  searchParams,
}: {
  pathname: string;
  period: AdminPeriod;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <nav className="admin-period" aria-label="Reporting period">
      {ADMIN_PERIODS.map((p) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(searchParams ?? {})) {
          if (key === "range") continue;
          if (value == null) continue;
          if (Array.isArray(value)) {
            for (const v of value) params.append(key, v);
          } else {
            params.set(key, value);
          }
        }
        params.set("range", p);
        const href = `${pathname}?${params.toString()}`;
        const active = p === period;
        return (
          <Link
            key={p}
            href={href}
            className={["admin-period-chip", active ? "is-active" : ""]
              .filter(Boolean)
              .join(" ")}
            prefetch={false}
          >
            {LABELS[p]}
          </Link>
        );
      })}
    </nav>
  );
}
