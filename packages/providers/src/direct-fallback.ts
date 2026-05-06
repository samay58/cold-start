export type DirectFallbackConfig = {
  exaApiKey?: string;
  firecrawlApiKey?: string;
  pdlApiKey?: string;
};

export function directFallbackGaps(config: DirectFallbackConfig) {
  return {
    exa: !config.exaApiKey,
    firecrawl: !config.firecrawlApiKey,
    pdl: !config.pdlApiKey,
  };
}
