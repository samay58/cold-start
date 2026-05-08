import Link from "next/link";

export default function HomePage() {
  return (
    <main className="cs-home">
      <section className="cs-home-shell">
        <div className="cs-home-topbar">
          <div className="cs-home-brand">
            <span className="cs-home-mark" aria-hidden="true">C</span>
            <span>Cold Start</span>
          </div>
          <span>coldstart.semitechie.vc</span>
        </div>

        <div className="cs-home-grid">
          <div className="cs-home-command">
            <span className="cs-home-hero-mark" aria-hidden="true">C</span>
            <div>
              <p className="cs-home-kicker">Company context</p>
              <h1>Cold Start</h1>
              <p className="cs-home-lede">
                Generate a sourced company profile from the tab you already have open. Keep the public facts shareable, then run the investor lens when the profile is worth going deeper on.
              </p>
            </div>
            <div className="cs-home-actions">
              <Link className="cs-home-button" href="/c/cartesia">Open example</Link>
              <a className="cs-home-link" href="#install">Chrome extension</a>
            </div>
          </div>

          <figure className="cs-anatomy" aria-label="How a profile resolves">
            <div className="cs-anatomy-row">
              <span>Current tab</span>
              <strong>cartesia.ai</strong>
            </div>
            <div className="cs-anatomy-row">
              <span>Profile</span>
              <strong>$91M · Series B · 3 sources</strong>
            </div>
            <div className="cs-anatomy-row">
              <span>Lens</span>
              <strong>Supported claims + open questions</strong>
            </div>
            <div className="cs-anatomy-source">
              <span className="cs-anatomy-source-pin" aria-hidden="true" />
              <div>
                <p className="cs-anatomy-source-tier">Source distance</p>
                <p className="cs-anatomy-source-meta">Independent material stays heavier than company-controlled copy.</p>
              </div>
            </div>
          </figure>
        </div>
      </section>
    </main>
  );
}
