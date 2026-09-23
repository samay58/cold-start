"""Rough monitors for the evidence remediation. Never pass-fail gates.

Usage: python3 eval/curation/remediation-2026-09/monitors.py <card json paths...>
"""
import glob, json, re, statistics, sys

CORPUS = "eval/curation/corpus/cards"


def slug_by_url():
    # Saved judgments are keyed by hashes, not slugs, so match their source URLs to corpus cards.
    index = {}
    for path in glob.glob(f"{CORPUS}/*.json"):
        card = json.load(open(path))["card"]
        for citation in card.get("citations", []):
            if citation.get("url"):
                index.setdefault(citation["url"], set()).add(card["slug"])
    return index


def judgment_slug(registry, index):
    votes = {}
    for item in registry:
        match = re.search(r"\((https?://[^)]+)\)\s*$", item.get("source", ""))
        for slug in index.get(match.group(1), ()) if match else ():
            votes[slug] = votes.get(slug, 0) + 1
    return max(votes, key=votes.get) if votes else "?"


def evidence_stubs(judgment_glob):
    index = slug_by_url()
    for path in sorted(glob.glob(judgment_glob)):
        registry = json.load(open(path))["evidenceRegistry"]
        stubs = [e["evidenceId"] for e in registry if e["text"].lstrip().startswith("{")]
        # An empty snippet falls back to the citation title, which is just as hollow.
        titles = [e["evidenceId"] for e in registry
                  if e["text"].strip() and e.get("source", "").startswith(e["text"].strip() + " (")]
        lengths = [len(e["text"]) for e in registry]
        model = "opus-5-5" if path.endswith(".claude-opus-5-5.json") else "opus-5"
        print(judgment_slug(registry, index), model, path.split("/")[-1][:8],
              "items", len(registry), "json", len(stubs), "title-only", len(titles), "median", int(statistics.median(lengths)))


ABSENCE = re.compile(
    r"not (publicly )?disclosed|undisclosed|isn'?t (public|disclosed)|not public|"
    r"no public (data|figure|disclos|record|evidence|information)|nothing (filed|public) shows|"
    r"no (disclosed|public|reported) (revenue|pricing|margin|financ|customer|metric)|"
    r"no (revenue|financial|pricing) (data|figure|disclos)|has not (disclosed|published|shared)|"
    r"does not (disclose|publish)|without (disclosed|public) ",
    re.I,
)


def strings(node, path=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from strings(value, f"{path}.{key}")
    elif isinstance(node, list):
        for value in node:
            yield from strings(value, f"{path}[]")
    elif isinstance(node, str):
        yield path, node


def absence_lines(card_paths):
    profiles_hit = 0
    for path in card_paths:
        hits = [s for p, s in strings(json.load(open(path)))
                if ".citations" not in p and ".sources" not in p and ABSENCE.search(s)]
        profiles_hit += bool(hits)
        print(path.split("/")[-1], len(hits))
    print("profiles with at least one absence line:", profiles_hit, "of", len(card_paths))


def citation_stubs(card_paths):
    # The same bug seen from the card: snippets that are provider JSON, or missing.
    for path in card_paths:
        citations = json.load(open(path))["card"].get("citations", [])
        snippets = [(c.get("snippet") or "").strip() for c in citations]
        stubs = sum(s.startswith("{") for s in snippets)
        empty = sum(not s for s in snippets)
        lengths = [len(s) for s in snippets if s and not s.startswith("{")] or [0]
        print(path.split("/")[-1], "citations", len(citations), "json", stubs, "empty", empty,
              "median readable", int(statistics.median(lengths)))


if __name__ == "__main__":
    evidence_stubs("eval/curation/how-it-wins-batch/_judgments/*.json")
    citation_stubs(sys.argv[1:])
    absence_lines(sys.argv[1:])
