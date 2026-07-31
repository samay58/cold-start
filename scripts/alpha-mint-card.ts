import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = "google/gemini-3-pro-image";

// The prompt is the card copy law in imperative form: product name only, the
// letterpress line, the open-ended number, the seal. Never "friend alpha", never
// an expiry, never feature copy. The style reference attached to every call keeps
// all cards reading as one edition; only the name and number vary.
export function buildMintPrompt(name: string, ordinal: number): string {
  const number = String(ordinal).padStart(2, "0");
  return [
    "Keep this exact card: same handmade cream paper, same deckle edge, same violet wax seal",
    "with CS at lower right, same lighting and composition.",
    `The letterpress line reads "Invitation, for ${name}", pressed visibly into the paper,`,
    "ink dark and matte.",
    `A smaller letterpress "No ${number}" sits quietly in the top right corner.`,
    '"Cold Start" stays small at lower left.',
    "Nothing else is printed on the card."
  ].join(" ");
}

export function imagesFromOpenRouterResponse(body: unknown): string[] {
  const images = (body as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] })
    ?.choices?.[0]?.message?.images;
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map((image) => image?.image_url?.url ?? "")
    .filter((url) => url.startsWith("data:image/"))
    .map((url) => url.split(",", 2)[1] ?? "")
    .filter(Boolean);
}

export async function mintInviteCandidates(input: {
  name: string;
  ordinal: number;
  referencePath: string;
  outDir: string;
}): Promise<string[]> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is missing; add it to .env.local.");
  }
  const reference = readFileSync(input.referencePath).toString("base64");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      usage: { include: true },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: buildMintPrompt(input.name, input.ordinal) },
          { type: "image_url", image_url: { url: `data:image/png;base64,${reference}` } }
        ]
      }]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenRouter mint failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  const images = imagesFromOpenRouterResponse(body);
  if (images.length === 0) {
    throw new Error("Mint returned no images; re-run or adjust the reference.");
  }
  mkdirSync(input.outDir, { recursive: true });
  return images.map((b64, index) => {
    const path = join(input.outDir, `candidate-${index + 1}.png`);
    writeFileSync(path, Buffer.from(b64, "base64"));
    return path;
  });
}
