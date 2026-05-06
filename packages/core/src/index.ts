export function companySlugFromDomain(input: string): string {
  const url = input.startsWith("http") ? new URL(input) : new URL(`https://${input}`);
  const host = url.hostname.replace(/^www\./, "");
  return host.split(".")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "unknown";
}
