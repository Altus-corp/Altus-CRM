import { usePlaceholderScreen, type PlaceholderCopy } from "./function";
import "./placeholder.css";

export function PlaceholderPage(props: PlaceholderCopy) {
  const screen = usePlaceholderScreen(props);
  return <div className="placeholder-page"><div className="placeholder-heading"><div><p className="eyebrow">Altus CRM</p><h1>{screen.title}</h1></div><span className="day-chip">{screen.dateLabel}</span></div><p className="placeholder-description">{screen.note}</p><section className="placeholder-empty" aria-live="polite"><span className="placeholder-empty-icon" aria-hidden="true">⌁</span><div><h2>Coming soon</h2><p>This workspace is ready for the next admin module.</p></div></section></div>;
}
