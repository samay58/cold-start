"use client";

import React, { useState } from "react";
import type { FormEvent } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

// Pure response-to-copy mapping, unit-tested directly (apps/web/tests/access-form.test.ts)
// without mounting the component: @testing-library/react is not installed in this repo (checked
// before writing this), so interactive fetch behavior is covered here instead of through a
// jsdom-rendered component test. Copy is verbatim from the task-17 brief (Step 2), extended with
// a third branch so a server fault (5xx, or a thrown fetch, reported as status 0 by the caller)
// never blames the visitor's input.
export function accessFormFailureMessage(status: number): string {
  if (status === 429) {
    return "Too many requests from here today. Try again tomorrow.";
  }

  if (status === 0 || status >= 500) {
    return "Something went wrong on our side. Try again in a minute.";
  }

  return "That did not send. Check the fields and try again.";
}

type AccessRequestBody = {
  name: string;
  email: string;
  note: string;
  company: string;
};

function bodyFromForm(form: HTMLFormElement): AccessRequestBody {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? "").trim(),
    email: String(data.get("email") ?? "").trim(),
    note: String(data.get("note") ?? "").trim(),
    // The honeypot: a real visitor never fills this in, so it stays empty.
    company: String(data.get("company") ?? "")
  };
}

export function AccessForm() {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);

    const body = bodyFromForm(event.currentTarget);

    try {
      const response = await fetch("/api/access-requests", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const json: unknown = await response.json().catch(() => null);
      const ok =
        response.ok && typeof json === "object" && json !== null && (json as { ok?: unknown }).ok === true;

      if (ok) {
        setState("success");
        return;
      }

      setErrorMessage(accessFormFailureMessage(response.status));
      setState("error");
    } catch {
      setErrorMessage(accessFormFailureMessage(0));
      setState("error");
    }
  }

  if (state === "success") {
    return <p className="cs-landing-access-success">Sent. A person reads it and answers either way.</p>;
  }

  return (
    <form className="cs-landing-access-form" onSubmit={handleSubmit}>
      <label className="cs-landing-access-field">
        <span className="sr-only">Name</span>
        <input autoComplete="name" name="name" placeholder="name" required type="text" />
      </label>
      <label className="cs-landing-access-field">
        <span className="sr-only">Email</span>
        <input autoComplete="email" name="email" placeholder="email" required type="email" />
      </label>
      <label className="cs-landing-access-field">
        <span className="sr-only">One line about why this is interesting to you</span>
        <textarea
          name="note"
          placeholder="one line about why this is interesting to you"
          required
          rows={2}
        />
      </label>

      {/* Honeypot: a real visitor never sees or fills this in. Offscreen via CSS, not
          display:none/hidden, so it stays in the accessibility tree's tab and autofill paths for
          bots that ignore CSS while never reaching a sighted keyboard user. */}
      <input
        aria-hidden="true"
        autoComplete="off"
        className="cs-landing-access-honeypot"
        name="company"
        tabIndex={-1}
        type="text"
      />

      <button className="cs-landing-seal-pill cs-landing-access-submit" disabled={state === "submitting"} type="submit">
        <span className="cs-landing-seal-pill-label">Send</span>
      </button>

      {state === "error" && errorMessage ? (
        <p className="cs-landing-access-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
