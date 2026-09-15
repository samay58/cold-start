import { EXTRACTION_UNAVAILABLE_PREFIX } from "@cold-start/core";
import {
  assertDistinctProviderHost,
  fallbackModelForStage,
  parseModelString,
  type LlmRequestOptions,
} from "./llm-provider";
import { isProviderUnavailableLlmError } from "./transient-error";

const PRIMARY_TIMEOUT_MS = 45_000;
const RECOVERY_TIMEOUT_MS = 90_000;

function alternateFor(primary: string): string | null {
  // ANTHROPIC_MODEL is extraction's last link: a flipped primary still has the Anthropic path.
  return fallbackModelForStage("extract_full", primary, { defaultModel: process.env.ANTHROPIC_MODEL });
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
  const alternate = alternateFor(primary);
  let lastError: unknown;
  try {
    return await attempt(primary, alternate ? PRIMARY_TIMEOUT_MS : RECOVERY_TIMEOUT_MS, run);
  } catch (error) {
    if (!isProviderUnavailableLlmError(error)) throw error;
    lastError = error;
  }
  if (alternate) {
    try {
      assertDistinctProviderHost(primary, alternate, lastError);
    } catch (error) {
      throw new Error(`${EXTRACTION_UNAVAILABLE_PREFIX} ${error instanceof Error ? error.message : String(error)}`, {
        cause: lastError,
      });
    }
    try {
      return await attempt(alternate, RECOVERY_TIMEOUT_MS, run, [parseModelString(primary).provider]);
    } catch (error) {
      if (!isProviderUnavailableLlmError(error)) throw error;
      lastError = error;
    }
  }

  // This operation already owns its recovery budget. A plain terminal error prevents
  // the inline executor or an Inngest step from replaying the whole paid sequence.
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${EXTRACTION_UNAVAILABLE_PREFIX} ${detail}`, { cause: lastError });
}
