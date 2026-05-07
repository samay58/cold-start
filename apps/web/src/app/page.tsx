import Link from "next/link";

export default function HomePage() {
  return (
    <main className="cs-home">
      <section className="cs-home-plate">
        <div className="cs-home-topbar">
          <div className="cs-home-brand">
            <span className="cs-home-mark" aria-hidden="true">C</span>
            <span>COLD START</span>
            <span>N° 0014</span>
          </div>
          <span>coldstart.semitechie.vc</span>
        </div>

        <div className="cs-home-hero">
          <div className="cs-home-meta">
            <span className="cs-home-hero-mark" aria-hidden="true">C</span>
            <span>Sourced · extension gated</span>
          </div>
          <h1>Cold Start.</h1>
          <p className="cs-home-lede">
            One sourced company plate from the site you already have open. Public facts stay shareable; the investor lens stays behind the extension.
          </p>
          <div className="cs-home-actions">
            <Link className="cs-home-button" href="/c/cartesia">Example card</Link>
            <a className="cs-home-link" href="#install">Chrome extension →</a>
          </div>
        </div>

        <figure className="cs-anatomy" aria-label="How a fact pins to a source">
          <div className="cs-anatomy-fact">
            <span className="cs-anatomy-label">i · raised</span>
            <span className="cs-anatomy-value">$91M</span>
            <span className="cs-anatomy-pin" aria-hidden="true">[3]</span>
          </div>
          <div className="cs-anatomy-source">
            <span className="cs-anatomy-source-pin" aria-hidden="true" />
            <div>
              <p className="cs-anatomy-source-tier">Independent technical</p>
              <p className="cs-anatomy-source-meta">Substack · Cartesia field notes</p>
            </div>
          </div>
          <figcaption>Sources rank by distance from the company.</figcaption>
        </figure>
      </section>
    </main>
  );
}
