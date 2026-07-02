export default function PrivacyPage() {
  return (
    <main className="cs-card-page" id="main-content">
      <article className="cs-card">
        <h1 className="cs-title">Privacy</h1>

        <h2>What Cold Start reads</h2>
        <p>
          When you click the extension on a company website, Cold Start reads the address of that tab so it knows
          which company to research. It does not read your browsing history, your other tabs, or anything on pages
          where you have not invoked it.
        </p>

        <h2>What happens when you generate a profile</h2>
        <p>
          Generating a profile sends the company domain to the Cold Start API, which queries public web sources and
          third-party data providers, including Exa search, Firecrawl page scraping, business-data enrichment
          services, and SEC EDGAR. Source text is processed by large-language-model providers to extract cited
          facts. These providers receive the company being researched. They do not receive your identity.
        </p>

        <h2>What gets stored</h2>
        <p>
          Cold Start stores the generated card, its source records and citations, and run telemetry such as timing
          and cost. The extension stores its connection settings in your browser.
        </p>

        <h2>What is public and what is not</h2>
        <p>
          Running Cold Start on a company creates or updates a public fact card at /c/&#123;slug&#125;. That card
          shows sourced public facts and their citations. It never shows investor synthesis, contact emails, or who
          asked for it. Investor synthesis and professional work emails appear only inside the authenticated Chrome
          extension.
        </p>

        <h2>Work emails</h2>
        <p>
          Inside the extension, Cold Start may show a founder or exec's work email when public sources support one.
          Each is labeled as observed (the exact address appeared in a public source, such as a public code commit) or
          inferred (constructed from the company's email pattern and not seen directly). Work emails are gated to the
          extension and never appear on the public card. The paid deep-contact lookup runs only when you ask for it.
        </p>

        <h2>What Cold Start does not do</h2>
        <p>
          It does not collect personal emails, personal phone numbers, or consumer background data, and it does not
          bulk-export contacts. It does not send outbound messages, act as a CRM, track your browsing, or make
          investment recommendations.
        </p>

        <h2>Questions</h2>
        <p>Cold Start is a small product run by its owner. Questions and deletion requests go directly to Samay.</p>
      </article>
    </main>
  );
}
