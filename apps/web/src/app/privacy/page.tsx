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
          and cost. The extension stores a revocable connection credential and a small retry queue in your browser.
          The server stores only hashes of invitation and connection credentials.
        </p>

        <h2>Friend alpha usage records</h2>
        <p>
          After an invited tester accepts the disclosure and connects the extension, Cold Start records named
          product interactions such as opening the panel, requesting a profile, opening a Lens category, or using a
          source or dossier control. These records are tied to the invitation and browser installation so the owner
          can diagnose failures and improve the product.
        </p>
        <p>
          Usage records do not include full page addresses, query strings, page titles, page content, Lens prose,
          source text, names, email addresses, copied values, invitation secrets, connection credentials, or raw
          error messages and stack traces. A company domain is recorded only after the tester invokes Cold Start.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Raw friend-alpha usage events are retained for 30 days. De-identified operational totals may be retained
          after the raw events are removed. A tester may ask to delete the invitation, installation, allowance, and
          identity-linked usage records at any time. Generated public fact cards are sourced product records rather
          than tester records and are reviewed separately.
        </p>

        <h2>What is public and what is not</h2>
        <p>
          Running Cold Start on a company creates or updates a public fact card at /c/&#123;slug&#125;. That card
          shows sourced public facts and their citations. It never shows investor synthesis, contact emails, or who
          asked for it. Investor synthesis and professional work emails appear only inside the authenticated
          browser extension.
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
        <p>
          Cold Start is a small product run by its owner. Questions and deletion requests can be sent to{" "}
          <a href="mailto:semitechie.vc@gmail.com">semitechie.vc@gmail.com</a>.
        </p>
      </article>
    </main>
  );
}
