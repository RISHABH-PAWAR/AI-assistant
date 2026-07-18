export const SUGGESTIONS = [
  "What appointments are open this week?",
  "I'd like to book a cleaning.",
  "Do you have anything on Friday?",
] as const;

export function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="chips" role="group" aria-label="Suggested messages">
      {SUGGESTIONS.map((s) => (
        <button key={s} type="button" className="chip" onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
