from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlencode


SCRIPT_PATH = Path(__file__).resolve()
WORKSPACE_ROOT = SCRIPT_PATH.parents[2]
BACKEND_ROOT = WORKSPACE_ROOT / "hackai26-pre-code"
BACKEND_SRC = BACKEND_ROOT / "packages" / "ai_decision_council" / "src"


def _ensure_backend_imports() -> None:
    if str(BACKEND_SRC) not in sys.path:
        sys.path.insert(0, str(BACKEND_SRC))


def _build_fake_app(token: str):
    _ensure_backend_imports()

    import ai_decision_council.api.fastapi.router as router_module
    from ai_decision_council.api.fastapi import (
        APISettings,
        FileStorageBackend,
        StaticTokenAuthBackend,
        create_app,
    )
    from ai_decision_council.config import CouncilConfig

    class _FakeCouncil:
        def __init__(self) -> None:
            self.config = CouncilConfig(
                api_key="scenario-key",
                api_url="https://api.openai.com/v1/chat/completions",
                models=[
                    "member-a",
                    "member-b",
                    "member-c",
                    "member-d",
                    "member-e",
                    "member-f",
                    "chairman-a",
                ],
                chairman_model="chairman-a",
                title_model="chairman-a",
                provider="openai",
            ).with_resolved_defaults()
            self.provider_adapter = object()

    async def _fake_stage1(prompt: str, **_kwargs: Any) -> list[dict[str, str]]:
        await asyncio.sleep(0.05)
        return [
            {"model": "member-a", "response": f"Execution should start with UX flow hardening. Prompt: {prompt}"},
            {"model": "member-b", "response": "Stabilize the websocket council contract before demoing."},
            {"model": "member-c", "response": "Protect Electron responsiveness by keeping runtime updates lightweight."},
            {"model": "member-d", "response": "Package the room as a reusable library with a demo path."},
            {"model": "member-e", "response": "Force clearer UX affordances so the chairman flow is instantly understandable."},
            {"model": "member-f", "response": "Treat observability and retries as first-class demo reliability requirements."},
            {"model": "chairman-a", "response": "Prioritize a reliable scenario demo and clear operator controls."},
        ]

    async def _fake_stage2(prompt: str, stage1_results: list[dict[str, str]], **_kwargs: Any):
        await asyncio.sleep(0.05)
        rankings = [
            {
                "model": entry["model"],
                "ranking": (
                    "FINAL RANKING:\n"
                    "1. Response A\n"
                    "2. Response B\n"
                    "3. Response C\n"
                    f"Prompt under review: {prompt}"
                ),
            }
            for entry in stage1_results
        ]
        return rankings, {"Response A": "member-a", "Response B": "member-b", "Response C": "chairman-a"}

    async def _fake_references(*_args: Any, **_kwargs: Any) -> list[dict[str, str]]:
        await asyncio.sleep(0.02)
        return [
            {
                "title": "Hackathon Demo Checklist",
                "url": "https://example.com/demo-checklist",
                "snippet": "Reliable controls and a polished narrative matter most for demos.",
            },
            {
                "title": "Electron UX Notes",
                "url": "https://example.com/electron-ux",
                "snippet": "Heavy renderer updates create visible UI lag during streaming workloads.",
            },
        ]

    async def _fake_debate(
        prompt: str,
        stage1_results: list[dict[str, str]],
        stage2_results: list[dict[str, str]],
        web_references: list[dict[str, str]],
        **_kwargs: Any,
    ) -> list[dict[str, str]]:
        await asyncio.sleep(0.05)
        return [
            {
                "model": result["model"],
                "debate": (
                    "BEST SUPPORTED POSITION:\nPrioritize a reliable council demo.\n"
                    "MAIN OBJECTION:\nVisual polish alone will not save a broken interaction flow.\n"
                    "REVISED RECOMMENDATION:\nShip a polished room only after controls and transport are stable.\n"
                    "KEY TRADEOFF:\nMore spectacle versus lower demo risk."
                ),
            }
            for result in stage1_results
        ]

    async def _fake_options(*_args: Any, **_kwargs: Any) -> list[dict[str, str]]:
        await asyncio.sleep(0.05)
        return [
            {
                "id": "option_a",
                "label": "Option A",
                "title": "Demo-first stabilization",
                "summary": "Focus on transport reliability, clear controls, and a clean room presentation.",
                "rationale": "Best fit for a live hackathon demo.",
            },
            {
                "id": "option_b",
                "label": "Option B",
                "title": "Feature expansion",
                "summary": "Add more host features before final polish.",
                "rationale": "Potentially stronger product story, higher execution risk.",
            },
            {
                "id": "option_c",
                "label": "Option C",
                "title": "Platform parity",
                "summary": "Prioritize adapter parity and defer some UX refinement.",
                "rationale": "Good long-term platform move.",
            },
        ]

    async def _fake_votes(*_args: Any, **_kwargs: Any):
        await asyncio.sleep(0.05)
        return (
            [
                {"model": "member-a", "vote": "vote a", "top_choice": "Option A"},
                {"model": "member-b", "vote": "vote b", "top_choice": "Option A"},
                {"model": "member-c", "vote": "vote c", "top_choice": "Option A"},
                {"model": "member-d", "vote": "vote d", "top_choice": "Option B"},
                {"model": "member-e", "vote": "vote e", "top_choice": "Option A"},
                {"model": "member-f", "vote": "vote f", "top_choice": "Option A"},
                {"model": "chairman-a", "vote": "vote g", "top_choice": "Option A"},
            ],
            [
                {
                    "option_id": "option_a",
                    "label": "Option A",
                    "title": "Demo-first stabilization",
                    "average_rank": 1.14,
                    "rankings_count": 7,
                    "first_choice_votes": 6,
                },
                {
                    "option_id": "option_b",
                    "label": "Option B",
                    "title": "Feature expansion",
                    "average_rank": 2.14,
                    "rankings_count": 7,
                    "first_choice_votes": 1,
                },
                {
                    "option_id": "option_c",
                    "label": "Option C",
                    "title": "Platform parity",
                    "average_rank": 2.71,
                    "rankings_count": 7,
                    "first_choice_votes": 0,
                },
            ],
        )

    async def _fake_final(
        prompt: str,
        stage1_results: list[dict[str, str]],
        stage2_results: list[dict[str, str]],
        debate_results: list[dict[str, str]],
        answer_choices: list[dict[str, str]],
        option_votes: list[dict[str, str]],
        option_rankings: list[dict[str, str]],
        web_references: list[dict[str, str]],
        **_kwargs: Any,
    ):
        await asyncio.sleep(0.05)
        top_points = "; ".join(result["response"] for result in stage1_results[:3])
        review_count = len(stage2_results)
        return {
            "model": "chairman-a",
            "response": (
                "## Recommended Answer\n"
                "Choose Option A: Demo-first stabilization.\n\n"
                "## Why This Answer Won\n"
                f"The council converged on transport reliability, operator clarity, and room polish as the strongest demo path. "
                f"Supporting notes: {top_points}. Review coverage: {review_count} ranking packets.\n\n"
                "## Referenced Evidence\n"
                "- [Hackathon Demo Checklist](https://example.com/demo-checklist)\n"
                "- [Electron UX Notes](https://example.com/electron-ux)"
            ),
            "winning_option": answer_choices[0],
            "references": web_references,
        }

    router_module.stage1_collect_responses = _fake_stage1
    router_module.stage2_collect_rankings = _fake_stage2
    router_module.gather_web_references = _fake_references
    router_module.collect_debate_rounds = _fake_debate
    router_module.generate_answer_choices = _fake_options
    router_module.collect_option_votes = _fake_votes
    router_module.synthesize_final_answer = _fake_final

    os.environ["LLM_COUNCIL_REFERENCE_API_TOKEN"] = token
    settings = APISettings(data_dir=str(BACKEND_ROOT / ".scenario-data"))
    return create_app(
        settings=settings,
        storage_backend=FileStorageBackend(settings.data_dir),
        auth_backend=StaticTokenAuthBackend(tokens={token}),
        council_factory=lambda: _FakeCouncil(),
    )


async def _capture_events(
    url: str,
    token: str,
    prompt: str,
    run_id: str,
    reasoning_effort: str,
) -> dict[str, Any]:
    import websockets

    query = urlencode({"token": token}) if token else ""
    target = f"{url}?{query}" if query else url

    async with websockets.connect(target, max_size=None) as websocket:
        await websocket.send(json.dumps({"type": "ping"}))
        heartbeat_raw = await websocket.recv()
        heartbeat = json.loads(heartbeat_raw)

        await websocket.send(
            json.dumps(
                {
                    "type": "run",
                    "runId": run_id,
                    "content": prompt,
                    "reasoningEffort": reasoning_effort,
                }
            )
        )

        events: list[dict[str, Any]] = []
        while True:
            raw_message = await websocket.recv()
            payload = json.loads(raw_message)
            items = payload if isinstance(payload, list) else [payload]
            for item in items:
                if isinstance(item, dict):
                    events.append(item)
            if any(item.get("type") in {"session.completed", "session.failed"} for item in items if isinstance(item, dict)):
                break

    return {"heartbeat": heartbeat, "events": events}


def main() -> int:
    parser = argparse.ArgumentParser(description="Deterministic council-room scenario helper.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8011)
    serve_parser.add_argument("--token", default="scenario-token")

    capture_parser = subparsers.add_parser("capture")
    capture_parser.add_argument("--url", required=True)
    capture_parser.add_argument("--token", default="scenario-token")
    capture_parser.add_argument("--prompt", required=True)
    capture_parser.add_argument("--run-id", required=True)
    capture_parser.add_argument("--reasoning-effort", default="high")

    args = parser.parse_args()

    if args.command == "serve":
        import uvicorn

        app = _build_fake_app(args.token)
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level="warning",
            access_log=False,
        )
        return 0

    if args.command == "capture":
        result = asyncio.run(
            _capture_events(
                url=args.url,
                token=args.token,
                prompt=args.prompt,
                run_id=args.run_id,
                reasoning_effort=args.reasoning_effort,
            )
        )
        print(json.dumps(result))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
