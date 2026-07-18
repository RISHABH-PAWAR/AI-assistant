import { LogoMark } from "./icons.js";

export function Header() {
  return (
    <header className="app-header">
      <div className="brand">
        <LogoMark />
        <div className="brand-text">
          <span className="brand-name">Lakeside Dental</span>
          <span className="brand-sub">Virtual receptionist</span>
        </div>
      </div>
      <div className="status-pill" aria-label="Assistant online">
        <span className="status-dot" />
        Online
      </div>
    </header>
  );
}
