export default function PrivacyPage() {
  return (
    <main className="cs-card-page">
      <article className="cs-card">
        <h1 className="cs-title">Privacy</h1>
        <p>Cold Start reads the company domain you ask it to analyze and stores source records and provider results used to generate the cited card.</p>
        <p>The Chrome extension can enrich professional work emails for people tied to the active company. It does not collect personal emails, phone numbers, or Whitepages data.</p>
        <p>It does not send outbound messages, act as a CRM, or make investment recommendations.</p>
        <p>The public card contains sourced facts only and omits contact emails. Investor synthesis and work emails are available in the Chrome extension surface.</p>
      </article>
    </main>
  );
}
