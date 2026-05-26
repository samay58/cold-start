import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from coldstart_graph import audit_fixture, diff_fixtures, markdown_report

FIXTURE = ROOT / "fixtures" / "cartesia-card.json"
FIXTURE_V2 = ROOT / "fixtures" / "cartesia-card-v2.json"


def load_fixture(path: Path = FIXTURE) -> dict:
    return json.loads(path.read_text())


def failing_score_names(result) -> set[str]:
    return {
        score.data["checkName"]
        for score in result.graph.all_objects()
        if score.type == "score" and not score.data["passed"]
    }


def test_fixture_ingest_creates_expected_graph_counts():
    result = audit_fixture(FIXTURE)

    assert result.counts == {
        "company": 1,
        "run": 1,
        "fact": 9,
        "citation": 3,
        "synthesis_line": 3,
        "question": 2,
        "score": 7,
    }
    assert len(result.graph.all_relations()) == 17


def test_invalid_citation_url_is_flagged():
    payload = load_fixture()
    payload["publicCard"]["citations"][0]["url"] = "javascript:alert(1)"

    result = audit_fixture(payload)

    assert "citation_urls_http" in failing_score_names(result)


def test_non_null_fact_without_citation_is_flagged():
    payload = load_fixture()
    payload["publicCard"]["identity"]["name"]["citationIds"] = []

    result = audit_fixture(payload)

    assert "resolved_facts_cited" in failing_score_names(result)


def test_public_synthesis_leak_is_flagged():
    payload = load_fixture()
    payload["publicCard"]["synthesis"] = copy.deepcopy(payload["extensionCard"]["synthesis"])

    result = audit_fixture(payload)

    assert "public_card_no_synthesis" in failing_score_names(result)


def test_synthesis_total_raised_mismatch_is_flagged():
    payload = load_fixture()
    payload["publicCard"]["funding"]["totalRaisedUsd"]["value"] = 67500000
    payload["extensionCard"]["synthesis"]["whyItMatters"] = {
        "text": "Browserbase has $128.5M raised across four rounds. [c1]",
        "citationIds": ["c1"],
    }

    result = audit_fixture(payload)

    assert "synthesis_total_raised_matches_card" in failing_score_names(result)


def test_valid_fixture_produces_markdown_report(tmp_path):
    result = audit_fixture(FIXTURE)

    report = markdown_report(result)

    assert "# ActiveGraph Cold Start Audit" in report
    assert "Cartesia" in report
    assert "citations: 3" in report
    assert "No failing checks." in report


def test_two_fixtures_produce_readable_diff():
    diff = diff_fixtures(FIXTURE, FIXTURE_V2)
    markdown = diff.to_markdown()

    assert "Fields gained" in markdown
    assert "team.headcount" in markdown
    assert "Citations gained" in markdown
    assert "c4" in markdown
    assert "Latency delta: +2129ms" in markdown
