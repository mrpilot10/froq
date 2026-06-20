declare module "@cashfreepayments/cashfree-js" {
  export interface CashfreeLoadOptions {
    mode: "sandbox" | "production";
  }

  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal" | string;
    returnUrl?: string;
  }

  export interface CashfreeCheckoutResult {
    error?: { type?: string; message?: string; code?: string };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string; [key: string]: unknown };
  }

  export interface Cashfree {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  }

  export function load(options: CashfreeLoadOptions): Promise<Cashfree>;
}
