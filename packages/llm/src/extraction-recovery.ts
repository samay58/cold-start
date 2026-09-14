import { parseModelString, providerEndpointHost, type LlmRequestOptions } from "./llm-provider";
import { isProviderUnavailableLlmError } from "./transient-error";

const PRIMARY_TIMEOUT_MS = 45_000;
const RECOVERY_TIMEOUT_MS = 90_000;

function alternateModel(primary: string): string | null {
  const alternate = process.env.LLM_EXTRACT_FALLBACK_MODEL?.trim()
    || process.env.LLM_FALLBACK_MODEL?.trim()
    || process.env.ANTHROPIC_MODEL?.trim();
  if (!alternate || alternate === "off" || parseModelString(alternate).provider === parseModelString(primary).provider) {
    return null;
  }
  return alternate;
}

async function attempt<T>(
  model: string,
  timeout: number,
  run: (model: string, options: LlmRequestOptions) => Promise<T>,
  excludedProviders?: readonly string[],
) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Profile extraction timed out", "TimeoutError"));
  }, timeout);
  try {
    return await run(model, {
      signal: controller.signal,
      timeout,
      maxRetries: 0,
      ...(excludedProviders?.length ? { excludedProviders } : {}),
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function withExtractionRecovery<T>(
  primary: string,
  run: (model: string, options: LlmRequestOptions) => Promise<T>
): Promise<T> {
  const alternate = alternateModel(primary);
  let lastError: unknown;
  try {
    return await attempt(primary, alternate ? PRIMARY_TIMEOUT_MS : RECOVERY_TIMEOUT_MS, run);
  } catch (error) {
    if (!isProviderUnavailableLlmError(error)) throw error;
    lastError = error;
  }
  if (alternate) {
    const primaryProvider = parseModelString(primary).provider;
    const alternateProvider = parseModelString(alternate).provider;
    const primaryHost = providerEndpointHost(primaryProvider);
    const alternateHost = providerEndpointHost(alternateProvider);
    if (primaryHost && primaryHost === alternateHost) {
      throw new Error(
        `Profile extraction is temporarily unavailable: fallback provider "${alternateProvider}" resolves to the primary endpoint host ${primaryHost}`,
        { cause: lastError },
      );
    }
    try {
      return await attempt(alternate, RECOVERY_TIMEOUT_MS, run, [primaryProvider]);
    } catch (error) {
      if (!isProviderUnavailableLlmError(error)) throw error;
      lastError = error;
    }
  }

  // This operation already owns its recovery budget. A plain terminal error prevents
  // the inline executor or an Inngest step from replaying the whole paid sequence.
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Profile extraction is temporarily unavailable: ${detail}`, { cause: lastError });
}
