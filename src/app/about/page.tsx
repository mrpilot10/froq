import type { Metadata } from "next";
import { SiteShell } from "@/components/landing/site-shell";

export const metadata: Metadata = {
  title: "About · Froq",
  description: "Froq builds tools that help restaurants fill the room, serve guests, and earn repeats.",
};

export default function AboutPage() {
  return (
    <SiteShell>
      <section className="lp-legal">
        <span className="lp-kicker">About</span>
        <h1 className="lp-h2">Built for the restaurant floor</h1>
        <p>
          Froq makes digital tools for local restaurants — loyalty stamps, smart queues, and AI menus —
          so guests get a better visit and teams spend less time juggling paper and apps.
        </p>
        <p>
          We&apos;re based in India and shipping product for hospitality businesses that want modern
          guest experiences without changing how their kitchen already runs.
        </p>
      </section>
    </SiteShell>
  );
}
