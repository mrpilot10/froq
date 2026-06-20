const CASHFREE_API_VERSION = "2023-08-01";

function apiBase() {
  const env = (process.env.CASHFREE_ENV ?? "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function credentials() {
  const appId = process.env.CASHFREE_APP_ID?.trim();
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim();
  if (!appId || !secretKey) {
    throw new Error("Cashfree is not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.");
  }
  return { appId, secretKey };
}

function headers() {
  const { appId, secretKey } = credentials();
  return {
    "Content-Type": "application/json",
    "x-api-version": CASHFREE_API_VERSION,
    "x-client-id": appId,
    "x-client-secret": secretKey,
  };
}

export interface CreateOrderInput {
  orderId: string;
  amount: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl?: string;
}

export interface CashfreeOrder {
  orderId: string;
  paymentSessionId: string;
  orderStatus: string;
}

export async function createCashfreeOrder(input: CreateOrderInput): Promise<CashfreeOrder> {
  const res = await fetch(`${apiBase()}/orders`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: input.amount,
      order_currency: "INR",
      customer_details: {
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      order_meta: input.returnUrl ? { return_url: input.returnUrl } : undefined,
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | { payment_session_id?: string; order_status?: string; message?: string }
    | null;

  if (!res.ok || !data?.payment_session_id) {
    throw new Error(data?.message ?? "Could not create the payment order.");
  }

  return {
    orderId: input.orderId,
    paymentSessionId: data.payment_session_id,
    orderStatus: data.order_status ?? "ACTIVE",
  };
}

export interface CashfreeOrderStatus {
  orderId: string;
  orderStatus: string;
  isPaid: boolean;
}

export async function getCashfreeOrderStatus(orderId: string): Promise<CashfreeOrderStatus> {
  const res = await fetch(`${apiBase()}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as
    | { order_status?: string; message?: string }
    | null;

  if (!res.ok || !data?.order_status) {
    throw new Error(data?.message ?? "Could not verify the payment.");
  }

  return {
    orderId,
    orderStatus: data.order_status,
    isPaid: data.order_status === "PAID",
  };
}
