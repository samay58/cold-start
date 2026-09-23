import Link from "next/link";

// Wrong card links and unknown routes land here instead of Next's stock 404, in the same card language as error.tsx.
export default function NotFound() {
  return (
    <main className="cs-card-page" id="main-content">
      <article className="cs-card">
        <h1 className="cs-title">No card is filed under this link.</h1>
        <p>Check the link, or find the company in the catalog.</p>
        <p>
          <Link className="cs-landing-seal-pill" href="/catalog">
            <span className="cs-landing-seal-pill-label">Browse the catalog</span>
          </Link>{" "}
          <Link href="/">Go to the home page</Link>
        </p>
      </article>
    </main>
  );
}
