export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`cs-brand-mark ${className}`.trim()}
      focusable="false"
      viewBox="0 0 34 22"
    >
      <path
        className="cs-brand-mark-aperture"
        d="M2.8 11C6.9 5.3 11.7 2.5 17 2.5S27.1 5.3 31.2 11C27.1 16.7 22.3 19.5 17 19.5S6.9 16.7 2.8 11Z"
      />
      <circle className="cs-brand-mark-ring" cx="17" cy="11" r="6.35" />
      <circle className="cs-brand-mark-ring cs-brand-mark-ring-inner" cx="17" cy="11" r="3.2" />
      <path className="cs-brand-mark-crosshair" d="M17 4.6v12.8M10.6 11h12.8" />
      <circle className="cs-brand-mark-core" cx="17" cy="11" r="2.05" />
    </svg>
  );
}
