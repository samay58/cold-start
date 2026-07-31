import { INVITE_WORDLIST } from "./invite-wordlist";

export { INVITE_WORDLIST };

// One pattern for both shapes: legacy 22+ char base64url secrets and new
// three-word codes (minimum 4+4+4 letters plus two hyphens = 14).
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{14,256}$/;

// Clean words can still combine badly (the what3words lesson). Screen the
// joined code, not the list.
const CODE_BLOCKLIST = /(kill|dead|hate|nazi|rape|bomb)/i;

function randomIndex(bound: number): number {
  // Rejection sampling over crypto randomness; works in Node and browsers.
  const limit = Math.floor(0xffffffff / bound) * bound;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      return buf[0] % bound;
    }
  }
}

export function generateInviteCode(): string {
  for (;;) {
    const picked = new Set<number>();
    while (picked.size < 3) {
      picked.add(randomIndex(INVITE_WORDLIST.length));
    }
    const code = [...picked].map((i) => INVITE_WORDLIST[i]).join("-");
    if (!CODE_BLOCKLIST.test(code) && INVITE_TOKEN_PATTERN.test(code)) {
      return code;
    }
  }
}
