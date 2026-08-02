"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Catches an uncaught render error under this segment (e.g. a cold-cache miss plus a DB
// blip on the landing or catalog pages, see lens2-reliability.md F3) so a visitor gets this
// card-language fallback instead of Next's bare default error page.
export default function ErrorBoundary({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="cs-card-page" id="main-content">
      <article className="cs-card">
        <h1 className="cs-title">Something went wrong on our side.</h1>
        <p>Reload the page. If it keeps happening, it is us, not you.</p>
        <button className="cs-landing-seal-pill" onClick={() => reset()} type="button">
          <span className="cs-landing-seal-pill-label">Reload</span>
        </button>
      </article>
    </main>
  );
}
