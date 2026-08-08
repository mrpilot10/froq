import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  preferredMerchantProduct,
  productsForMerchantHome,
} from "./last-product";
import { EMPTY_ENTITLEMENTS, type Entitlements } from "./entitlements";

function entitlementsWith(...products: Array<"loyalty" | "queue" | "reservation" | "menu">): Entitlements {
  const next = { ...EMPTY_ENTITLEMENTS };
  for (const product of products) {
    next[product] = {
      product,
      planId: `${product}-starter`,
      status: "active",
      onboarded: true,
      pendingPlanId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      trialStartedAt: null,
      trialEndsAt: null,
    };
  }
  return next;
}

describe("preferredMerchantProduct", () => {
  it("sends staff to their only product", () => {
    assert.equal(
      preferredMerchantProduct({
        role: "staff",
        memberProductIds: ["queue"],
        lastProduct: "loyalty",
        entitlements: entitlementsWith("loyalty", "queue"),
      }),
      "queue",
    );
  });

  it("prefers last-used when staff has multiple products", () => {
    assert.equal(
      preferredMerchantProduct({
        role: "staff",
        memberProductIds: ["queue", "reservation"],
        lastProduct: "reservation",
        entitlements: entitlementsWith("loyalty", "queue", "reservation"),
      }),
      "reservation",
    );
  });

  it("prefers last-used for owners among enabled products", () => {
    assert.equal(
      preferredMerchantProduct({
        role: "owner",
        memberProductIds: [],
        lastProduct: "menu",
        entitlements: entitlementsWith("loyalty", "menu"),
      }),
      "menu",
    );
  });
});

describe("productsForMerchantHome", () => {
  it("intersects staff grants with enabled products", () => {
    assert.deepEqual(
      productsForMerchantHome({
        role: "staff",
        memberProductIds: ["queue", "loyalty"],
        entitlements: entitlementsWith("queue"),
      }),
      ["queue"],
    );
  });
});
