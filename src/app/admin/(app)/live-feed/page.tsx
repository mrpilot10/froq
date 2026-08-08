import {
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import { getLiveFeed, type LiveFeedEvent } from "@/lib/admin/metrics";

const KIND_LABEL: Record<LiveFeedEvent["kind"], string> = {
  signup: "Signup",
  subscription: "Paid",
  trial: "Trial",
  customer: "Customer",
  ai: "AI",
  churn: "Churn",
};

export default async function LiveFeedPage() {
  const data = await getLiveFeed({ days: 14, limit: 100 });

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Last 14 days · assembled from merchants, subscriptions, customers &amp; AI
          spikes · {formatShortDate(data.generatedAt)}
        </p>
      </div>

      <section className="admin-stat-row">
        {(
          [
            ["signup", "Signups"],
            ["subscription", "Paid"],
            ["trial", "Trials"],
            ["customer", "Customers"],
            ["ai", "AI spikes"],
            ["churn", "Cancels"],
          ] as const
        ).map(([kind, label]) => (
          <div key={kind} className="admin-stat">
            <div className="admin-stat-label">{label}</div>
            <div className="admin-stat-value">{formatNumber(data.counts[kind])}</div>
          </div>
        ))}
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Event stream</h2>
        <p className="admin-muted">
          Near-realtime operator feed. Hard refresh for the latest snapshot (Supabase
          realtime channel can deepen this later).
        </p>
        <ul className="admin-feed" style={{ marginTop: 16 }}>
          {data.events.length === 0 ? (
            <li className="admin-empty-inline">No events in the selected window.</li>
          ) : (
            data.events.map((ev) => (
              <li key={ev.id}>
                <span
                  className={`admin-feed-dot admin-feed-dot--${ev.kind}`}
                  aria-hidden
                />
                <div>
                  <div className="admin-feed-title">
                    <span className="admin-pill" style={{ marginRight: 8 }}>
                      {KIND_LABEL[ev.kind]}
                    </span>
                    {ev.title}
                  </div>
                  <div className="admin-feed-sub">{ev.subtitle}</div>
                </div>
                <time className="admin-feed-time" title={formatShortDate(ev.at)}>
                  {formatRelativeTime(ev.at)}
                </time>
              </li>
            ))
          )}
        </ul>
      </section>
    </>
  );
}
