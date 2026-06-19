import { Check, Clock, Gift } from "lucide-react";
import type { HistoryEntry } from "@/lib/loyalty/types";
import { TabPageShell } from "./tab-page-shell";

interface HistoryScreenProps {
  entries: HistoryEntry[];
}

function HistoryStatusIcon({ status }: { status: HistoryEntry["status"] }) {
  if (status === "pending") {
    return <Clock size={18} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />;
  }

  if (status === "redeemed") {
    return <Gift size={18} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />;
  }

  return <Check size={18} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />;
}

function statusLabel(status: HistoryEntry["status"]) {
  if (status === "pending") return "Pending approval";
  if (status === "redeemed") return "Reward redeemed";
  return "Approved";
}

export function HistoryScreen({ entries }: HistoryScreenProps) {
  return (
    <TabPageShell
      title="History"
      subtitle="Your recent visits and stamp activity"
    >
      <div className="panel-card history-panel">
        {entries.length === 0 ? (
          <p className="history-empty">No activity yet. Collect your first stamp to get started.</p>
        ) : (
          <ul className="history-list">
            {entries.map((entry) => (
              <li key={entry.id} className="history-item">
                <div className={`history-icon history-icon--${entry.status}`}>
                  <HistoryStatusIcon status={entry.status} />
                </div>
                <div className="history-copy">
                  <div className="history-label">{entry.label}</div>
                  <div className="history-date">{entry.date}</div>
                </div>
                <span className={`history-badge history-badge--${entry.status}`}>
                  {statusLabel(entry.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TabPageShell>
  );
}
