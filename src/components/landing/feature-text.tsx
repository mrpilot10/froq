/** Renders plan feature copy with numeric values emphasized. */
export function FeatureText({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,]*)/g);
  return (
    <span className="feature-text">
      {parts.map((part, index) =>
        /^\d[\d,]*$/.test(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part,
      )}
    </span>
  );
}
