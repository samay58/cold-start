export default function LoadingCard() {
  return (
    <main className="cs-card-page" id="main-content">
      <section className="cs-loading-plate" aria-live="polite">
        <div className="cs-loading-topbar">
          <div className="cs-home-brand">
            <span className="cs-home-mark" aria-hidden="true">C</span>
            <span>Cold Start</span>
          </div>
          <span>Filing</span>
        </div>
        <div className="cs-loading-body">
          <span className="cs-home-hero-mark" aria-hidden="true">C</span>
          <div>
            <p className="cs-home-kicker">Loading profile</p>
            <h1 className="cs-loading-shimmer">Loading sourced facts.</h1>
          </div>
          <div className="cs-loading-stages">
            <p><span>01</span> Finding sources</p>
            <p><span>02</span> Reading evidence</p>
            <p><span>03</span> Filing the card</p>
          </div>
        </div>
      </section>
    </main>
  );
}
