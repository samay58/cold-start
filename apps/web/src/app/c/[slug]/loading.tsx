// The card route only reads a saved card, so the wait gets one plain line and no motion.
export default function LoadingCard() {
  return (
    <main className="cs-card-page" id="main-content">
      <section className="cs-loading-plate" aria-live="polite">
        <div className="cs-loading-topbar">
          <div className="cs-home-brand">
            <span className="cs-home-mark" aria-hidden="true">C</span>
            <span>Cold Start</span>
          </div>
        </div>
        <p className="cs-loading-line" role="status">Loading profile.</p>
      </section>
    </main>
  );
}
