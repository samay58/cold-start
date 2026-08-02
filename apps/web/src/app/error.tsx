"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Keep uncaught route render failures inside the card language instead of Next's bare fallback.
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
