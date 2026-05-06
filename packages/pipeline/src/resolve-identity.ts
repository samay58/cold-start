import { canonicalDomain, companySlugFromDomain } from "@cold-start/core";

export function resolveIdentityFromInput(input: string) {
  const domain = canonicalDomain(input);
  return {
    slug: companySlugFromDomain(domain),
    domain
  };
}
