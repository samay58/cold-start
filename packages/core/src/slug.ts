export function companySlugFromDomain(input: string): string {
  const value = input.trim();
  const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
  const host = url.hostname.replace(/^www\./, "");
  const firstLabel = host.split(".")[0] ?? "unknown";
  const slug = firstLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "unknown";
}

export function canonicalDomain(input: string): string {
  const value = input.trim();
  const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
  return url.hostname.replace(/^www\./, "").toLowerCase();
}
