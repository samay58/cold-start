export default function LoadingCard() {
  return (
    <main className="cs-card-page">
      <section className="cs-loading-plate" aria-live="polite">
        <div className="cs-loading-topbar">
          <div className="cs-home-brand">
            <span className="cs-home-mark" aria-hidden="true">C</span>
            <span>COLD START</span>
            <span>N° 0014</span>
          </div>
          <span>live · loading</span>
        </div>
        <div className="cs-loading-hero">
          <span className="cs-home-hero-mark" aria-hidden="true">C</span>
          <div>
            <p className="cs-home-kicker">Building · first observation</p>
            <h1>Loading sourced facts.</h1>
          </div>
        </div>
        <div className="cs-loading-stages">
          <p><span>i ✓</span> Resolve identity</p>
          <p><span>ii →</span> Catalogue sources</p>
          <p><span>iii ·</span> Render plate</p>
        </div>
      </section>
    </main>
  );
}
