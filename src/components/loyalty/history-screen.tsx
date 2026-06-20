import { Check, Clock, Gift } from "lucide-react";
import type { HistoryEntry, RewardCardGroup } from "@/lib/loyalty/types";
import { TabPageShell } from "./tab-page-shell";

interface HistoryScreenProps {
  entries: HistoryEntry[];
  rewardCards: RewardCardGroup[];
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

function cardStatusText(card: RewardCardGroup) {
  if (card.status === "completed") return `Redeemed · ${card.redeemedDate}`;
  if (card.rewardReady) return "Ready to redeem";
  if (card.pending) return "Stamp awaiting approval";
  return "In progress";
}

function RewardCardItem({ card }: { card: RewardCardGroup }) {
  const stateClass =
    card.status === "completed"
      ? "is-completed"
      : card.rewardReady
        ? "is-ready"
        : "is-active";

  return (
    <div className={`reward-card-group ${stateClass}`}>
      <div className="reward-card-group-head">
        <div className="reward-card-group-titles">
          <span className="reward-card-group-name">Card {card.index}</span>
          <span className="reward-card-group-reward">{card.rewardName}</span>
        </div>
        <span className={`reward-card-group-badge ${stateClass}`}>{cardStatusText(card)}</span>
      </div>

      <div className="reward-card-dots" aria-hidden="true">
        {Array.from({ length: card.totalStamps }, (_, i) => {
          const filledDot = card.status === "completed" || i < card.stampsCollected;
          return (
            <span key={i} className={`reward-card-dot${filledDot ? " filled" : ""}`}>
              {filledDot && <Check size={11} strokeWidth={3} />}
            </span>
          );
        })}
      </div>

      <div className="reward-card-count">
        {card.status === "completed"
          ? `${card.totalStamps}/${card.totalStamps} stamps collected`
          : `${card.stampsCollected}/${card.totalStamps} stamps collected`}
      </div>
    </div>
  );
}

export function HistoryScreen({ entries, rewardCards }: HistoryScreenProps) {
  return (
    <TabPageShell title="Rewards" subtitle="Your loyalty cards and stamp activity">
      <div className="reward-cards-list">
        {rewardCards.map((card) => (
          <RewardCardItem key={card.id} card={card} />
        ))}
      </div>

      <div className="history-section-label">Activity</div>
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
