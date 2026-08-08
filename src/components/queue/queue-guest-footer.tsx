import { FroqFooter } from "@/components/shared/froq-footer";
import { FollowUs } from "@/components/loyalty/social-row";
import type { QueuePageSocialLinks } from "@/app/queue/actions";

interface QueueGuestFooterProps {
  socialLinks?: QueuePageSocialLinks;
}

/**
 * Shared guest-queue chrome under every state: Follow Us (when links exist),
 * then Powered by froq.io.
 */
export function QueueGuestFooter({ socialLinks = {} }: QueueGuestFooterProps) {
  return (
    <>
      <FollowUs links={socialLinks} className="follow-us follow-us--footer" />
      <FroqFooter />
    </>
  );
}
