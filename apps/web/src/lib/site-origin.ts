const DEFAULT_WEB_ORIGIN = "https://cold-start.semitechie.vc";

export function webOrigin() {
  return process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN;
}
