# Data use and Limited Use

Use this as the source for the Chrome Web Store privacy questionnaire. Reconcile every selection against the exact release commit before submission.

## Data handled

| Data type | Handling |
|---|---|
| Web browsing activity | The extension reads the active tab URL only after the user clicks Cold Start. It derives and transmits the company domain needed for the requested research. It does not collect a browsing history. |
| Authentication information | A revocable alpha connection credential is stored in `chrome.storage.local` and sent only to the Cold Start API over HTTPS. It is not sent to retrieval or LLM providers. |
| Product interaction and run telemetry | The alpha may record named product actions, run state, timing, stable error codes, allowance accounting, extension version, and installation identity. It does not record page content, Lens prose, claims, source snippets, names, email addresses, copied values, full URLs, or query strings. |

Cold Start does not read website content from the active tab. It does not handle personal communications, precise location, health information, payment information, passwords, or clipboard data.

## Uses

Data is used only to:

- provide the requested company research and maintain the user's alpha access;
- secure the service, enforce allowances, and prevent abuse;
- diagnose reliability, cost, and compatibility problems; and
- improve the extension's user-facing research workflow.

Cold Start does not sell user data. It does not use user data for advertising, credit decisions, or unrelated personalization.

## Transfers

The company domain and public research evidence may be processed by Cold Start's retrieval, enrichment, hosting, database, workflow, and LLM service providers solely to deliver the requested feature. Tester identity and authentication credentials are not sent to retrieval, enrichment, or LLM providers.

Human access is limited to user-requested support, security and abuse investigation, legal obligations, and aggregated or de-identified internal operations.

## Limited Use statement

Cold Start's use and transfer of information received from Google APIs and Chrome extension permissions complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

Cold Start uses permission-derived data only to provide or improve its single user-facing purpose. It transfers that data only when necessary to provide the service, for security, to comply with law, or as part of a merger, acquisition, or sale of assets. It does not use or transfer the data for personalized advertising. Humans do not read user data except with the user's consent for support, for security, to comply with law, or after aggregation and de-identification for internal operations.

The privacy policy URL is `https://cold-start.semitechie.vc/privacy`. The product must show any required prominent disclosure and consent before collection; store copy and the privacy policy alone do not satisfy that requirement.
