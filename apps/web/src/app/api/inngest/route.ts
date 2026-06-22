import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { generateCardFunction } from "../../../inngest/functions";
import { contactEnrichmentFunction } from "../../../inngest/contact-enrichment";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateCardFunction, contactEnrichmentFunction],
});
