export function alphaAccessEnabled() {
  return process.env.ALPHA_ACCESS_ENABLED !== "false";
}

export function alphaGenerationEnabled() {
  return process.env.ALPHA_GENERATION_ENABLED !== "false";
}
