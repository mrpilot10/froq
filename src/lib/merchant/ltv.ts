import type { MerchantCustomer, MerchantStats } from "./types";

export function computeLtv(lifetimeVisits: number, avgOrderValue: number) {
  return Math.round(lifetimeVisits * avgOrderValue);
}

export function customerLtv(customer: MerchantCustomer, avgOrderValue: number) {
  return computeLtv(customer.lifetimeVisits, avgOrderValue);
}

export function avgLtv(stats: MerchantStats, avgOrderValue: number) {
  return computeLtv(stats.avgLifetimeVisits, avgOrderValue);
}

export function totalLtv(stats: MerchantStats, avgOrderValue: number) {
  return avgLtv(stats, avgOrderValue) * stats.totalCustomers;
}

export function formatCurrency(value: number) {
  return `\u20B9${value.toLocaleString("en-IN")}`;
}

export function formatCompactCurrency(value: number) {
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`;
  if (value >= 1000) return `\u20B9${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return formatCurrency(value);
}
