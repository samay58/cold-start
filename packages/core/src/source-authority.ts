export const sourceAuthorityRegistry = {
  // Source-gate trust is intentionally broader than source-quality rank. A host
  // listed here can survive same-name ambiguity, but incentive-aware quality
  // classification still decides how much judgment it should carry.
  specialistTechnical: [
    "semianalysis.com",
    "latentspace.ai",
    "interconnects.ai",
    "simonwillison.net",
    "thegradient.pub",
    "distill.pub",
    "danluu.com",
    "eugeneyan.com",
    "lilianweng.github.io",
    "karpathy.ai",
    "epoch.ai",
    "metr.org",
    "arxiv.org",
    "openreview.net",
    "papers.ssrn.com",
    "ssrn.com",
    "nature.com",
    "science.org",
    "mlcommons.org",
    "artificialanalysis.ai",
    "lmsys.org",
    "lmarena.ai",
    "swebench.com",
    "livebench.ai",
    "evalplus.github.io"
  ],
  specialistAnalysis: [
    "sacrainsights.com",
    "stratechery.com",
    "ben-evans.com",
    "exponentialview.co",
    "theintrinsicperspective.com",
    "ilyastrebulaev.substack.com",
    "oneusefulthing.org",
    "importai.net",
    "ai-supremacy.com",
    "newcomer.co",
    "platforms.substack.com",
    "newsletter.pragmaticengineer.com",
    "pragmaticengineer.com",
    "every.to",
    "understandingai.org",
    "lennysnewsletter.com",
    "notboring.co",
    "nooneshappy.com",
    "signalbloom.ai",
    "danshapiro.com",
    "sgdecypher.substack.com",
    "platformer.news"
  ],
  analystResearch: [
    "gartner.com",
    "forrester.com",
    "idc.com",
    "mckinsey.com",
    "bcg.com",
    "bain.com",
    "cbinsights.com",
    "pitchbook.com",
    "tracxn.com",
    "dealroom.co",
    "mordorintelligence.com",
    "grandviewresearch.com",
    "research.alpha-sense.com",
    "stateof.ai",
    "hai.stanford.edu",
    "aiindex.stanford.edu",
    "brookings.edu",
    "rand.org",
    "cfr.org",
    "federalreserve.gov",
    "cloudsecurityalliance.org"
  ],
  reputableReporting: [
    "reuters.com",
    "bloomberg.com",
    "wsj.com",
    "ft.com",
    "nytimes.com",
    "techcrunch.com",
    "theinformation.com",
    "theverge.com",
    "wired.com",
    "fortune.com",
    "forbes.com",
    "businessinsider.com",
    "axios.com",
    "venturebeat.com",
    "siliconangle.com",
    "cnbc.com",
    "economist.com",
    "technologyreview.com",
    "theregister.com",
    "arstechnica.com",
    "semafor.com",
    "404media.co",
    "restofworld.org",
    "finsmes.com",
    "sifted.eu",
    "eu-startups.com"
  ],
  ventureFirm: [
    // Strebulaev and Jackson's 2026 VC ranking work is one input here, not a claim that
    // investor-authored content is neutral. These hosts are trusted for relevance gating
    // and ranked as incentive-bearing reporting in source quality.
    "sequoiacap.com",
    "dst-global.com",
    "accel.com",
    "a16z.com",
    "tigerglobal.com",
    "foundersfund.com",
    "indexventures.com",
    "iconiqcapital.com",
    "iconiqgrowth.com",
    "nea.com",
    "generalcatalyst.com",
    "bvp.com",
    "generalatlantic.com",
    "sutterhillventures.com",
    "lsvp.com",
    "ribbitcap.com",
    "insightpartners.com",
    "benchmark.com",
    "greylock.com",
    "ivp.com",
    "kleinerperkins.com",
    "thrivecap.com",
    "firstround.com",
    "redpoint.com",
    "madrona.com",
    "firstmark.com",
    "contrary.com",
    "research.contrary.com",
    "activantcapital.com",
    "unusual.vc",
    "heavybit.com",
    "obvious.vc",
    "radical.vc",
    "dcvc.com",
    "sparkcapital.com",
    "matrix.vc",
    "matrixpartners.com",
    "foundationcapital.com",
    "homebrew.co",
    "haystack.vc",
    "upfront.com",
    "canaan.com",
    "cowboy.vc",
    "battery.com",
    "coatue.com",
    "menlovc.com",
    "luxcapital.com",
    "usv.com",
    "sapphireventures.com",
    "tcv.com",
    "meritechcapital.com",
    "felicis.com",
    "8vc.com",
    "slow.co",
    "boxgroup.com",
    "foundercollective.com",
    "initialized.com",
    "floodgate.com",
    "susaventures.com",
    "pear.vc",
    "boldstart.vc",
    "amplifypartners.com",
    "theory.ventures",
    "conviction.com",
    "abstraction.vc",
    "nfx.com",
    "signal.nfx.com",
    "craftventures.com",
    "ycombinator.com"
  ],
  expertTranscript: [
    "colossus.com",
    "joincolossus.com",
    "acquired.fm",
    "podscripts.co",
    "20vc.com",
    "investlikethebest.libsyn.com"
  ],
  communitySignal: [
    "news.ycombinator.com",
    "lobste.rs",
    "reddit.com",
    "stackshare.io",
    "stackoverflow.blog",
    "dev.to"
  ],
  publicRecord: [
    "sec.gov",
    "federalregister.gov",
    "uspto.gov",
    "fda.gov",
    "clinicaltrials.gov",
    "sam.gov",
    "data.gov",
    "ec.europa.eu",
    "gov.uk"
  ],
  pressRelease: [
    "prnewswire.com",
    "businesswire.com",
    "globenewswire.com",
    "accesswire.com",
    "einpresswire.com",
    "newswire.com",
    "prweb.com",
    "newsfilecorp.com",
    "cision.com"
  ],
  developerPlatform: [
    "github.com",
    "docs.github.com",
    "gitlab.com",
    "bitbucket.org",
    "pypi.org",
    "npmjs.com",
    "npmjs.org",
    "crates.io",
    "pkg.go.dev",
    "rubygems.org",
    "hub.docker.com",
    "docker.com",
    "huggingface.co",
    "paperswithcode.com"
  ],
  professionalAndFundingDatabase: [
    "linkedin.com",
    "crunchbase.com",
    "theorg.com",
    "privco.com",
    "sacra.com",
    "forgeglobal.com",
    "hiive.com",
    "zanbato.com",
    "rootdata.com",
    "marketwatch.com",
    "macrotrends.net"
  ]
} as const;

export type SourceAuthorityCategory = keyof typeof sourceAuthorityRegistry;

export function normalizeAuthorityHost(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    ?.toLowerCase() ?? "";
}

export function authorityHostMatches(host: string, registeredHost: string) {
  const normalizedHost = normalizeAuthorityHost(host);
  const normalizedRegisteredHost = normalizeAuthorityHost(registeredHost);
  return normalizedHost === normalizedRegisteredHost || normalizedHost.endsWith(`.${normalizedRegisteredHost}`);
}

export function sourceAuthorityCategoriesForHost(host: string): SourceAuthorityCategory[] {
  return (Object.entries(sourceAuthorityRegistry) as Array<[SourceAuthorityCategory, readonly string[]]>)
    .flatMap(([category, hosts]) => hosts.some((registeredHost) => authorityHostMatches(host, registeredHost)) ? [category] : []);
}

export function isTrustedSourceGateHost(host: string) {
  return sourceAuthorityCategoriesForHost(host).length > 0;
}
