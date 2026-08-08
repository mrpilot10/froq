import assert from "node:assert/strict";
import {
  googleReviewsUrlFromPlaceId,
  resolveGuestSocialLinks,
  toExternalUrl,
} from "./guest-social-links";

assert.equal(toExternalUrl("www.facebook.com"), "https://www.facebook.com");
assert.equal(toExternalUrl("  "), undefined);
assert.equal(
  googleReviewsUrlFromPlaceId("ChIJtest"),
  "https://search.google.com/local/writereview?placeid=ChIJtest",
);

// Facebook pasted into Website → Follow Us facebook, no globe website.
{
  const links = resolveGuestSocialLinks(
    { website_url: "www.facebook.com", google_place_id: "ChIJabc" },
    { google_business_url: "" },
  );
  assert.equal(links.facebook, "https://www.facebook.com");
  assert.equal(links.website, undefined);
  assert.equal(
    links.googleReviews,
    "https://search.google.com/local/writereview?placeid=ChIJabc",
  );
}

// Explicit google_business_url wins over place id.
{
  const links = resolveGuestSocialLinks(
    {
      google_business_url: "g.page/r/xyz",
      google_place_id: "ChIJignored",
    },
    null,
  );
  assert.equal(links.googleReviews, "https://g.page/r/xyz");
}

// Real website stays as website; empty Follow Us socials stay empty.
{
  const links = resolveGuestSocialLinks(
    { website_url: "jimisburger.com" },
    null,
  );
  assert.equal(links.website, "https://jimisburger.com");
  assert.equal(links.facebook, undefined);
  assert.equal(links.instagram, undefined);
  assert.equal(links.googleReviews, undefined);
}

console.log("guest-social-links tests passed");
