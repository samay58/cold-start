from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from activegraph import Graph


Json = dict[str, Any]


CHECK_ORDER = [
    "public_card_no_synthesis",
    "synthesis_citation_ids_valid",
    "resolved_facts_cited",
    "synthesis_total_raised_matches_card",
    "citation_urls_http",
    "required_basics_shape",
    "report_metrics_visible",
]

REQUIRED_FACT_PATHS = [
    "identity.name",
    "identity.oneLiner",
    "funding.totalRaisedUsd",
    "team.founders",
]


@dataclass(frozen=True)
class AuditResult:
    source: str
    payload: Json
    graph: Graph
    counts: dict[str, int]
    metrics: dict[str, Any]
    scores: list[dict[str, Any]]
    object_ids: dict[str, dict[str, str]]

    @property
    def failing_scores(self) -> list[dict[str, Any]]:
        return [score for score in self.scores if not score["passed"]]

    def to_dict(self) -> Json:
        return {
            "source": self.source,
            "company": self.payload.get("company", {}),
            "counts": self.counts,
            "metrics": self.metrics,
            "scores": self.scores,
            "relations": [relation.to_dict() for relation in self.graph.all_relations()],
        }


@dataclass(frozen=True)
class GraphDiff:
    left_source: str
    right_source: str
    fields_gained: list[str]
    fields_lost: list[str]
    citations_gained: list[str]
    citations_lost: list[str]
    synthesis_gained: list[str]
    synthesis_lost: list[str]
    checks_newly_passing: list[str]
    checks_newly_failing: list[str]
    latency_delta_ms: int | None
    cost_delta_usd: float | None

    def to_dict(self) -> Json:
        return {
            "leftSource": self.left_source,
            "rightSource": self.right_source,
            "fieldsGained": self.fields_gained,
            "fieldsLost": self.fields_lost,
            "citationsGained": self.citations_gained,
            "citationsLost": self.citations_lost,
            "synthesisGained": self.synthesis_gained,
            "synthesisLost": self.synthesis_lost,
            "checksNewlyPassing": self.checks_newly_passing,
            "checksNewlyFailing": self.checks_newly_failing,
            "latencyDeltaMs": self.latency_delta_ms,
            "costDeltaUsd": self.cost_delta_usd,
        }

    def to_markdown(self) -> str:
        lines = [
            "# ActiveGraph Cold Start Diff",
            "",
            f"Left: `{self.left_source}`",
            f"Right: `{self.right_source}`",
            "",
            _list_section("Fields gained", self.fields_gained),
            _list_section("Fields lost", self.fields_lost),
            _list_section("Citations gained", self.citations_gained),
            _list_section("Citations lost", self.citations_lost),
            _list_section("Synthesis lines gained", self.synthesis_gained),
            _list_section("Synthesis lines lost", self.synthesis_lost),
            _list_section("Checks newly passing", self.checks_newly_passing),
            _list_section("Checks newly failing", self.checks_newly_failing),
            "",
            f"Latency delta: {_signed_int(self.latency_delta_ms, 'ms')}",
            f"Cost delta: {_signed_float(self.cost_delta_usd)}",
        ]
        return "\n".join(lines).strip() + "\n"


def audit_fixture(source: str | Path | Json) -> AuditResult:
    payload, label = _load_payload(source)
    graph = Graph(run_id=f"coldstart-audit:{Path(label).stem}")
    object_ids: dict[str, dict[str, str]] = {
        "fact": {},
        "citation": {},
        "synthesis": {},
        "question": {},
        "score": {},
    }

    company = payload.get("company") or _company_from_card(payload)
    company_obj = graph.add_object("company", {
        "name": company.get("name"),
        "domain": company.get("domain"),
        "category": company.get("category"),
    })

    public_card = _public_card(payload)
    extension_card = _extension_card(payload)
    run_obj = graph.add_object("run", {
        "sourceFile": label,
        "mode": payload.get("mode") or "fixture",
        "generatedAt": payload.get("generatedAt") or public_card.get("generatedAt"),
        "latencyMs": payload.get("latencyMs"),
        "status": payload.get("runStatus", {}).get("status", "fixture"),
        "costUsd": _cost_usd(payload),
    })
    graph.add_relation(run_obj.id, company_obj.id, "run_evaluates_company")

    citations = _citation_map(public_card, extension_card)
    for citation_id, citation in citations.items():
        citation_obj = graph.add_object("citation", {
            "id": citation_id,
            "url": citation.get("url"),
            "title": citation.get("title"),
            "sourceType": citation.get("sourceType"),
        })
        object_ids["citation"][citation_id] = citation_obj.id
        graph.add_relation(citation_obj.id, company_obj.id, "citation_belongs_to_company")

    facts = _concrete_facts(public_card)
    for path, fact in facts:
        fact_obj = graph.add_object("fact", {
            "path": path,
            "value": fact.get("value"),
            "status": fact.get("status"),
            "confidence": fact.get("confidence"),
            "citationIds": fact.get("citationIds", []),
        })
        object_ids["fact"][path] = fact_obj.id
        for citation_id in fact.get("citationIds", []):
            target = object_ids["citation"].get(citation_id)
            if target:
                graph.add_relation(fact_obj.id, target, "fact_cites_citation")

    synthesis_lines = _synthesis_lines(extension_card)
    for index, line in enumerate(synthesis_lines, start=1):
        key = f"synthesis.{index}"
        line_obj = graph.add_object("synthesis_line", {
            "text": line["text"],
            "citationIds": line["citationIds"],
            "publicOrPrivate": "private",
            "source": line["source"],
        })
        object_ids["synthesis"][key] = line_obj.id
        for citation_id in line["citationIds"]:
            target = object_ids["citation"].get(citation_id)
            if target:
                graph.add_relation(line_obj.id, target, "synthesis_cites_citation")

    for index, question in enumerate(_open_questions(extension_card), start=1):
        question_obj = graph.add_object("question", {
            "text": question,
            "source": "extensionCard.synthesis.openQuestions",
        })
        object_ids["question"][str(index)] = question_obj.id

    scores = _run_checks(public_card, extension_card, facts, citations, payload)
    for score in scores:
        score_obj = graph.add_object("score", score)
        object_ids["score"][score["checkName"]] = score_obj.id
        if not score["passed"]:
            for path in score.get("factPaths", []):
                target = object_ids["fact"].get(path)
                if target:
                    graph.add_relation(score_obj.id, target, "score_flags_fact")
            for key in score.get("synthesisKeys", []):
                target = object_ids["synthesis"].get(key)
                if target:
                    graph.add_relation(score_obj.id, target, "score_flags_synthesis")

    counts = _counts(graph)
    metrics = _metrics(payload, public_card, extension_card, facts, citations)
    return AuditResult(
        source=label,
        payload=payload,
        graph=graph,
        counts=counts,
        metrics=metrics,
        scores=scores,
        object_ids=object_ids,
    )


def markdown_report(result: AuditResult) -> str:
    company = result.payload.get("company", {})
    metrics = result.metrics
    lines = [
        "# ActiveGraph Cold Start Audit",
        "",
        f"Company: {company.get('name', 'unknown')} <{company.get('domain', 'unknown')}>",
        f"Source: `{result.source}`",
        "",
    ]
    note = result.payload.get("runStatus", {}).get("note")
    if note:
        lines.extend([f"Capture note: {note}", ""])

    lines.extend(["## Graph", ""])
    for object_type in ["company", "run", "fact", "citation", "synthesis_line", "question", "score"]:
        lines.append(f"- {object_type}: {result.counts.get(object_type, 0)}")

    lines.extend([
        "",
        "## Metrics",
        "",
        f"- sources: {metrics['sourceCount']}",
        f"- citations: {metrics['citationCount']}",
        f"- synthesis lines: {metrics['synthesisCount']}",
        f"- missing core fields: {', '.join(metrics['missingCoreFields']) if metrics['missingCoreFields'] else '-'}",
        f"- latency: {metrics['latencyMs']}ms" if metrics["latencyMs"] is not None else "- latency: unknown",
        "",
        "## Checks",
        "",
    ])

    if result.failing_scores:
        for score in result.failing_scores:
            lines.append(f"- {score['severity']}: {score['checkName']} - {score['message']}")
    else:
        lines.append("No failing checks.")

    return "\n".join(lines).strip() + "\n"


def diff_fixtures(left: str | Path | Json, right: str | Path | Json) -> GraphDiff:
    left_result = audit_fixture(left)
    right_result = audit_fixture(right)

    left_fields = _field_values(left_result)
    right_fields = _field_values(right_result)
    left_citations = _citation_labels(left_result)
    right_citations = _citation_labels(right_result)
    left_synthesis = set(_synthesis_texts(left_result))
    right_synthesis = set(_synthesis_texts(right_result))
    left_failing = {score["checkName"] for score in left_result.failing_scores}
    right_failing = {score["checkName"] for score in right_result.failing_scores}

    left_latency = left_result.metrics["latencyMs"]
    right_latency = right_result.metrics["latencyMs"]
    left_cost = _cost_usd(left_result.payload)
    right_cost = _cost_usd(right_result.payload)

    return GraphDiff(
        left_source=left_result.source,
        right_source=right_result.source,
        fields_gained=sorted(set(right_fields) - set(left_fields)),
        fields_lost=sorted(set(left_fields) - set(right_fields)),
        citations_gained=sorted(set(right_citations) - set(left_citations)),
        citations_lost=sorted(set(left_citations) - set(right_citations)),
        synthesis_gained=sorted(right_synthesis - left_synthesis),
        synthesis_lost=sorted(left_synthesis - right_synthesis),
        checks_newly_passing=sorted(left_failing - right_failing),
        checks_newly_failing=sorted(right_failing - left_failing),
        latency_delta_ms=right_latency - left_latency if isinstance(left_latency, int) and isinstance(right_latency, int) else None,
        cost_delta_usd=round(right_cost - left_cost, 6) if left_cost is not None and right_cost is not None else None,
    )


def write_audit(result: AuditResult, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(result.source).stem
    json_path = out_dir / f"{stem}.audit.json"
    md_path = out_dir / f"{stem}.audit.md"
    json_path.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True) + "\n")
    md_path.write_text(markdown_report(result))
    return json_path, md_path


def write_diff(diff: GraphDiff, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    left = Path(diff.left_source).stem
    right = Path(diff.right_source).stem
    json_path = out_dir / f"{left}__{right}.diff.json"
    md_path = out_dir / f"{left}__{right}.diff.md"
    json_path.write_text(json.dumps(diff.to_dict(), indent=2, sort_keys=True) + "\n")
    md_path.write_text(diff.to_markdown())
    return json_path, md_path


def _load_payload(source: str | Path | Json) -> tuple[Json, str]:
    if isinstance(source, dict):
        return source, "<memory>"
    path = Path(source)
    return json.loads(path.read_text()), str(path)


def _public_card(payload: Json) -> Json:
    return payload.get("publicCard") or payload.get("card") or payload


def _extension_card(payload: Json) -> Json:
    return payload.get("extensionCard") or payload.get("fullCard") or payload


def _company_from_card(payload: Json) -> Json:
    card = _public_card(payload)
    identity = card.get("identity", {})
    name = identity.get("name", {}).get("value") if isinstance(identity.get("name"), dict) else None
    return {
        "name": name,
        "domain": card.get("domain"),
        "category": payload.get("category"),
    }


def _citation_map(public_card: Json, extension_card: Json) -> dict[str, Json]:
    citations: dict[str, Json] = {}
    for card in [public_card, extension_card]:
        for citation in card.get("citations", []) if isinstance(card, dict) else []:
            citation_id = citation.get("id")
            if citation_id and citation_id not in citations:
                citations[citation_id] = citation
    return citations


def _is_resolved_fact(value: Any) -> bool:
    return isinstance(value, dict) and {"value", "status", "confidence", "citationIds"}.issubset(value.keys())


def _concrete_facts(card: Json) -> list[tuple[str, Json]]:
    facts: list[tuple[str, Json]] = []

    def visit(node: Any, path: list[str]) -> None:
        if _is_resolved_fact(node):
            value = node.get("value")
            if node.get("status") != "unknown" and value is not None and value != []:
                facts.append((".".join(path), node))
            return
        if isinstance(node, dict):
            for key, child in node.items():
                if key in {"citations", "signals", "comparables", "synthesis"}:
                    continue
                visit(child, [*path, key])

    visit(card, [])
    return facts


def _synthesis_lines(card: Json) -> list[Json]:
    synthesis = card.get("synthesis")
    if not isinstance(synthesis, dict):
        return []

    lines: list[Json] = []
    for source in ["whyItMatters", "bullCase", "bearCase"]:
        value = synthesis.get(source)
        entries = value if isinstance(value, list) else [value]
        for entry in entries:
            normalized = _normalize_sourced_text(entry, source)
            if normalized:
                lines.append(normalized)
    return lines


def _normalize_sourced_text(entry: Any, source: str) -> Json | None:
    if isinstance(entry, str) and entry.strip():
        return {"text": entry.strip(), "citationIds": _citation_ids_from_text(entry), "source": source}
    if isinstance(entry, dict):
        text = str(entry.get("text") or "").strip()
        if text:
            ids = entry.get("citationIds")
            return {
                "text": text,
                "citationIds": ids if isinstance(ids, list) else _citation_ids_from_text(text),
                "source": source,
            }
    return None


def _citation_ids_from_text(text: str) -> list[str]:
    ids: list[str] = []
    for part in text.split("[")[1:]:
        citation_id = part.split("]", 1)[0].strip()
        if citation_id:
            ids.append(citation_id)
    return ids


def _open_questions(card: Json) -> list[str]:
    synthesis = card.get("synthesis")
    if not isinstance(synthesis, dict):
        return []
    questions = synthesis.get("openQuestions")
    return [str(question) for question in questions] if isinstance(questions, list) else []


def _run_checks(public_card: Json, extension_card: Json, facts: list[tuple[str, Json]], citations: dict[str, Json], payload: Json) -> list[Json]:
    citation_ids = set(citations)
    scores = [
        _score(
            "public_card_no_synthesis",
            "critical",
            "public card omits gated synthesis",
            "synthesis" not in public_card,
            synthesis_keys=["synthesis.1"],
        )
    ]

    bad_synthesis_keys = []
    for index, line in enumerate(_synthesis_lines(extension_card), start=1):
        if not line["citationIds"] or any(citation_id not in citation_ids for citation_id in line["citationIds"]):
            bad_synthesis_keys.append(f"synthesis.{index}")
    scores.append(_score(
        "synthesis_citation_ids_valid",
        "high",
        "every synthesis line cites existing citation IDs",
        not bad_synthesis_keys,
        synthesis_keys=bad_synthesis_keys,
    ))

    bad_fact_paths = [
        path
        for path, fact in facts
        if not fact.get("citationIds") or any(citation_id not in citation_ids for citation_id in fact.get("citationIds", []))
    ]
    scores.append(_score(
        "resolved_facts_cited",
        "high",
        "every non-null resolved fact has at least one valid citation ID",
        not bad_fact_paths,
        fact_paths=bad_fact_paths,
    ))

    funding_mismatches = _synthesis_total_raised_mismatches(public_card, extension_card)
    scores.append(_score(
        "synthesis_total_raised_matches_card",
        "high",
        "synthesis total-raised claims match funding.totalRaisedUsd",
        not funding_mismatches,
        synthesis_keys=[key for key, _ in funding_mismatches],
    ))

    bad_urls = [citation_id for citation_id, citation in citations.items() if not _is_http_url(citation.get("url"))]
    scores.append(_score(
        "citation_urls_http",
        "high",
        "every citation URL parses as http or https",
        not bad_urls,
    ))

    malformed_required = [path for path in REQUIRED_FACT_PATHS if not _required_fact_ok(public_card, path)]
    scores.append(_score(
        "required_basics_shape",
        "medium",
        "required basics fields are resolved facts or explicitly unknown",
        not malformed_required,
        fact_paths=[path for path in malformed_required if path in {fact_path for fact_path, _ in facts}],
    ))

    metrics = _metrics(payload, public_card, extension_card, facts, citations)
    metrics_visible = all(key in metrics for key in ["sourceCount", "citationCount", "synthesisCount", "missingCoreFields", "latencyMs"])
    scores.append(_score(
        "report_metrics_visible",
        "medium",
        "report exposes source count, citation count, synthesis count, missing core fields, and latency",
        metrics_visible,
    ))

    return sorted(scores, key=lambda score: CHECK_ORDER.index(score["checkName"]))


def _synthesis_total_raised_mismatches(public_card: Json, extension_card: Json) -> list[tuple[str, int]]:
    total = _get_path(public_card, "funding.totalRaisedUsd")
    expected = total.get("value") if _is_resolved_fact(total) else None
    if not isinstance(expected, int | float) or expected <= 0:
        return []

    mismatches: list[tuple[str, int]] = []
    for index, line in enumerate(_synthesis_lines(extension_card), start=1):
        text = line["text"]
        if "raised" not in text.lower():
            continue
        for amount in _money_amounts(text):
            if abs(amount - expected) / expected > 0.05:
                mismatches.append((f"synthesis.{index}", amount))
                break
    return mismatches


def _money_amounts(text: str) -> list[int]:
    amounts: list[int] = []
    for match in re.finditer(r"\$([0-9]+(?:\.[0-9]+)?)\s*([MB])\b", text, flags=re.IGNORECASE):
        value = float(match.group(1))
        multiplier = 1_000_000_000 if match.group(2).lower() == "b" else 1_000_000
        amounts.append(round(value * multiplier))
    return amounts


def _score(
    check_name: str,
    severity: str,
    message: str,
    passed: bool,
    *,
    fact_paths: list[str] | None = None,
    synthesis_keys: list[str] | None = None,
) -> Json:
    return {
        "checkName": check_name,
        "passed": passed,
        "severity": severity,
        "message": message,
        "factPaths": fact_paths or [],
        "synthesisKeys": synthesis_keys or [],
    }


def _required_fact_ok(card: Json, path: str) -> bool:
    value = _get_path(card, path)
    if not _is_resolved_fact(value):
        return False
    if value.get("value") is None:
        return value.get("status") == "unknown"
    return isinstance(value.get("citationIds"), list)


def _get_path(root: Json, path: str) -> Any:
    current: Any = root
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _is_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _metrics(payload: Json, public_card: Json, extension_card: Json, facts: list[tuple[str, Json]], citations: dict[str, Json]) -> Json:
    return {
        "sourceCount": len(citations),
        "citationCount": len(citations),
        "synthesisCount": len(_synthesis_lines(extension_card)),
        "factCount": len(facts),
        "missingCoreFields": _missing_core_fields(public_card),
        "latencyMs": payload.get("latencyMs"),
        "costUsd": _cost_usd(payload),
    }


def _missing_core_fields(card: Json) -> list[str]:
    missing: list[str] = []
    for path in REQUIRED_FACT_PATHS:
        fact = _get_path(card, path)
        if not _is_resolved_fact(fact) or fact.get("value") in (None, []):
            missing.append(path)
    return missing


def _cost_usd(payload: Json) -> float | None:
    for card in [_public_card(payload), _extension_card(payload)]:
        value = card.get("generationCostUsd") if isinstance(card, dict) else None
        if isinstance(value, int | float):
            return float(value)
    return None


def _counts(graph: Graph) -> dict[str, int]:
    counts: dict[str, int] = {}
    for obj in graph.all_objects():
        counts[obj.type] = counts.get(obj.type, 0) + 1
    return counts


def _field_values(result: AuditResult) -> dict[str, Any]:
    return {
        obj.data["path"]: obj.data["value"]
        for obj in result.graph.all_objects()
        if obj.type == "fact"
    }


def _citation_labels(result: AuditResult) -> set[str]:
    labels = set()
    for obj in result.graph.all_objects():
        if obj.type == "citation":
            labels.add(f"{obj.data['id']} {obj.data.get('url')}")
    return labels


def _synthesis_texts(result: AuditResult) -> list[str]:
    return [
        obj.data["text"]
        for obj in result.graph.all_objects()
        if obj.type == "synthesis_line"
    ]


def _list_section(title: str, values: list[str]) -> str:
    if not values:
        return f"## {title}\n\n-\n"
    return f"## {title}\n\n" + "\n".join(f"- {value}" for value in values) + "\n"


def _signed_int(value: int | None, suffix: str) -> str:
    if value is None:
        return "unknown"
    sign = "+" if value >= 0 else ""
    return f"{sign}{value}{suffix}"


def _signed_float(value: float | None) -> str:
    if value is None:
        return "unknown"
    sign = "+" if value >= 0 else ""
    return f"{sign}${value:.4f}"


def main() -> None:
    parser = argparse.ArgumentParser(description="ActiveGraph Cold Start fixture audit harness")
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit_parser = subparsers.add_parser("audit")
    audit_parser.add_argument("--fixture", required=True)
    audit_parser.add_argument("--out", required=True)

    diff_parser = subparsers.add_parser("diff")
    diff_parser.add_argument("--left", required=True)
    diff_parser.add_argument("--right", required=True)
    diff_parser.add_argument("--out", required=True)

    args = parser.parse_args()

    if args.command == "audit":
        result = audit_fixture(Path(args.fixture))
        json_path, md_path = write_audit(result, Path(args.out))
        print(f"wrote {json_path}")
        print(f"wrote {md_path}")
        return

    if args.command == "diff":
        diff = diff_fixtures(Path(args.left), Path(args.right))
        json_path, md_path = write_diff(diff, Path(args.out))
        print(f"wrote {json_path}")
        print(f"wrote {md_path}")


if __name__ == "__main__":
    main()
