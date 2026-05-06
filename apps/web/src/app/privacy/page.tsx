export default function PrivacyPage() {
  return (
    <main className="cs-card-page">
      <article className="cs-card">
        <h1 className="cs-title">Privacy</h1>
        <p>Cold Start reads the company domain you ask it to analyze and stores public sources used to generate a cited company card.</p>
        <p>It does not scrape contacts, send outbound messages, act as a CRM, or make investment recommendations.</p>
        <p>The public card contains sourced facts only. Investor synthesis is available in the Chrome extension surface.</p>
      </article>
    </main>
  );
}
