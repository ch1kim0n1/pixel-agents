import { useEffect, useMemo, useState } from "react";
import {
  COUNCIL_STAGE_LABELS,
  COUNCIL_STAGE_ORDER,
  CouncilActionBanner,
  CouncilMissionLog,
  CouncilOutcomePanel,
  CouncilProgressPanel,
  CouncilRosterPanel,
  PixelCouncilRoom,
  buildCouncilStageRail,
  buildMissionLogEntries,
  connectCouncilRoomWebSocket,
  councilStatusLabel,
  councilStatusTone,
  createMockCouncilConnection,
  deriveCouncilMilestone,
  deriveCouncilNextAction,
  getCouncilActionBannerCopy,
  type CouncilEvent,
  type CouncilEventConnection,
  type CouncilMemberDescriptor,
  type CouncilOutcomeSummary,
  type CouncilRosterEntry,
  type CouncilRunHistoryEntry,
  type CouncilStage,
  type CouncilStageTimelineEntry,
  type CouncilUxSessionState,
  type CouncilUxTransportState,
} from "./lib/index.js";
import "./council-demo.css";

interface DemoFormState {
  wsUrl: string;
  prompt: string;
  roomZoom: number;
}

interface ActiveConnectionState {
  wsUrl: string;
}

type JudgeTabId = "live" | "decision" | "roster" | "log";

const DEFAULT_PROMPT =
  "Evaluate our hackathon pitch and propose execution priorities.";
const DEFAULT_WS_URL = (import.meta.env.VITE_COUNCIL_WS_URL || "").trim();
const COUNCIL_TOKEN = (import.meta.env.VITE_COUNCIL_TOKEN || "").trim();
const ROOM_ZOOM_OPTIONS = [2.5, 3, 3.5, 4, 4.5, 5] as const;
const DEFAULT_ROOM_ZOOM = (() => {
  const parsed = Number(import.meta.env.VITE_COUNCIL_ROOM_ZOOM || 3.5);
  if (!Number.isFinite(parsed)) return 3.5;
  return Math.max(2.5, Math.min(6, parsed));
})();
const JUDGE_TABS: Array<{ id: JudgeTabId; label: string }> = [
  { id: "live", label: "Live" },
  { id: "decision", label: "Decision" },
  { id: "roster", label: "Roster" },
  { id: "log", label: "Log" },
];

const STAGE_SUMMARY_FALLBACK: Record<CouncilStage, string> = {
  first_opinions: "Opening positions were captured from the full council.",
  review: "Peer review ranked the strongest opening responses.",
  debate: "The council pressure-tested the tradeoffs and weak assumptions.",
  options: "The chairman shaped the debate into concrete paths.",
  vote: "The room locked its ballots and produced a winner.",
  final_synthesis: "The final recommendation was packaged for decision-makers.",
};

function readWebSocketUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("councilWs");
  return candidate && candidate.trim() ? candidate.trim() : DEFAULT_WS_URL;
}

function readPrompt(): string {
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt");
  return prompt && prompt.trim() ? prompt.trim() : DEFAULT_PROMPT;
}

function normalizeForm(form: DemoFormState): DemoFormState {
  return {
    wsUrl: form.wsUrl.trim(),
    prompt: form.prompt.trim(),
    roomZoom: Math.max(2.5, Math.min(6, form.roomZoom)),
  };
}

function toActiveConnection(form: DemoFormState): ActiveConnectionState {
  return {
    wsUrl: form.wsUrl.trim(),
  };
}

function createRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatRunId(runId: string | null): string {
  if (!runId) return "No active run";
  if (runId.length <= 18) return runId;
  return `${runId.slice(0, 8)}...${runId.slice(-6)}`;
}

function buildConnection(
  active: ActiveConnectionState,
  onTransportError: (error: string) => void,
): CouncilEventConnection {
  if (!active.wsUrl) {
    return createMockCouncilConnection();
  }
  return connectCouncilRoomWebSocket({
    url: active.wsUrl,
    token: COUNCIL_TOKEN || undefined,
    onTransportError,
  });
}

function composeFollowUpPrompt(
  prompt: string,
  latestQuestion: string | null,
  lastSummary: string | null,
): string {
  const content = prompt.trim();
  if (!content) return "";

  const context: string[] = [];
  if (latestQuestion) {
    context.push(`Previous council clarification request: ${latestQuestion}`);
  }
  if (lastSummary) {
    context.push(`Previous council summary: ${lastSummary}`);
  }
  if (context.length === 0) return content;
  return `${context.join("\n")}\n\nUser follow-up for the next council run:\n${content}`;
}

function mapMembers(members: CouncilMemberDescriptor[]): CouncilRosterEntry[] {
  return members.map((member, index) => ({
    id: member.id,
    displayName: member.displayName,
    role:
      member.role === "chairman" || (!member.role && index === 0)
        ? "chairman"
        : "member",
    status: "idle",
    statusLabel: "Idle",
    tone: "neutral",
    personaName: member.personaName,
    personaSummary: member.personaSummary,
  }));
}

function updateMemberState(
  members: CouncilRosterEntry[],
  memberId: string,
  status: string,
  detail?: string,
): CouncilRosterEntry[] {
  return members.map((member) =>
    member.id === memberId
      ? {
          ...member,
          status,
          statusLabel: councilStatusLabel(status),
          tone: councilStatusTone(status),
          detail,
        }
      : member,
  );
}

function upsertTimelineEntry(
  previous: CouncilStageTimelineEntry[],
  stage: CouncilStage,
  summary?: string,
): CouncilStageTimelineEntry[] {
  const nextEntry: CouncilStageTimelineEntry = {
    stage,
    label: COUNCIL_STAGE_LABELS[stage],
    summary: summary?.trim() || STAGE_SUMMARY_FALLBACK[stage],
  };

  const deduped = previous.filter((entry) => entry.stage !== stage);
  return [...deduped, nextEntry].sort(
    (left, right) =>
      COUNCIL_STAGE_ORDER.indexOf(left.stage) -
      COUNCIL_STAGE_ORDER.indexOf(right.stage),
  );
}

function buildBriefReadiness(prompt: string): number {
  const content = prompt.trim();
  if (!content) return 0;

  let score = 20;
  if (content.length >= 60) score += 20;
  if (content.length >= 140) score += 15;
  if (
    /\b(objective|goal|success|judge|user|constraint|deadline|budget|scope)\b/i.test(
      content,
    )
  ) {
    score += 25;
  }
  if (/\n/.test(content) || /[:;-]/.test(content)) {
    score += 10;
  }
  if (content.split(/\s+/).length >= 16) {
    score += 10;
  }
  return Math.min(100, score);
}

function primaryActionLabel(
  nextAction: ReturnType<typeof deriveCouncilNextAction>,
): string {
  if (nextAction === "connect") return "Connect Council";
  if (nextAction === "clarify") return "Clarify And Rerun";
  if (nextAction === "rerun") return "Retry Mission";
  return "Start Run";
}

function sessionLabel(sessionState: CouncilUxSessionState): string {
  return sessionState.replaceAll("_", " ");
}

function transportLabel(transportState: CouncilUxTransportState): string {
  return transportState === "mock"
    ? "demo ready"
    : transportState.replaceAll("_", " ");
}

export default function CouncilDemoApp() {
  const [form, setForm] = useState<DemoFormState>({
    wsUrl: readWebSocketUrl(),
    prompt: readPrompt(),
    roomZoom: DEFAULT_ROOM_ZOOM,
  });
  const [activeConnection, setActiveConnection] =
    useState<ActiveConnectionState>(
      toActiveConnection({
        wsUrl: readWebSocketUrl(),
        prompt: readPrompt(),
        roomZoom: DEFAULT_ROOM_ZOOM,
      }),
    );
  const [transportState, setTransportState] = useState<CouncilUxTransportState>(
    readWebSocketUrl() ? "connecting" : "mock",
  );
  const [transportMessage, setTransportMessage] = useState(
    readWebSocketUrl() ? "Connecting..." : "Demo council stream is ready.",
  );
  const [sessionState, setSessionState] =
    useState<CouncilUxSessionState>("idle");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<CouncilStage | null>(null);
  const [completedStages, setCompletedStages] = useState<Set<CouncilStage>>(
    () => new Set(),
  );
  const [sessionFeed, setSessionFeed] = useState<string[]>([]);
  const [latestQuestion, setLatestQuestion] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [sessionOutcome, setSessionOutcome] =
    useState<CouncilOutcomeSummary | null>(null);
  const [members, setMembers] = useState<CouncilRosterEntry[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [hadWaiting, setHadWaiting] = useState(false);
  const [hadError, setHadError] = useState(false);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [activeTab, setActiveTab] = useState<JudgeTabId>("live");
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [stageTimeline, setStageTimeline] = useState<
    CouncilStageTimelineEntry[]
  >([]);
  const [runHistory, setRunHistory] = useState<CouncilRunHistoryEntry[]>([]);

  useEffect(() => {
    document.documentElement.classList.add("council-scroll-open");
    document.body.classList.add("council-scroll-open");
    document.getElementById("root")?.classList.add("council-scroll-open");

    return () => {
      document.documentElement.classList.remove("council-scroll-open");
      document.body.classList.remove("council-scroll-open");
      document.getElementById("root")?.classList.remove("council-scroll-open");
    };
  }, []);

  const connection = useMemo(
    () =>
      buildConnection(activeConnection, (error) => {
        setTransportState("error");
        setTransportMessage(error);
      }),
    [activeConnection],
  );

  useEffect(() => {
    if (!activeConnection.wsUrl) {
      setTransportState("mock");
      setTransportMessage("Demo council stream is ready.");
      return;
    }
    setTransportState("connecting");
    setTransportMessage(`Connecting to ${activeConnection.wsUrl}`);
  }, [activeConnection.wsUrl]);

  useEffect(() => {
    const unsubscribe = connection.subscribe((event: CouncilEvent) => {
      if (event.type === "heartbeat") {
        setTransportState((current) =>
          current === "error" ? current : "connected",
        );
        setTransportMessage(
          activeConnection.wsUrl
            ? "Live council stream ready."
            : "Demo council stream ready.",
        );
        return;
      }

      if (event.type === "session.started") {
        const nextMembers = mapMembers(event.members);
        setTransportState(activeConnection.wsUrl ? "connected" : "mock");
        setTransportMessage("Council session started.");
        setSessionState("running");
        setActiveRunId(event.runId ?? null);
        setActiveStage(null);
        setCompletedStages(new Set());
        setSessionFeed(["Council session started."]);
        setLatestQuestion(null);
        setLastSummary(null);
        setSessionOutcome(null);
        setMembers(nextMembers);
        setSelectedMemberId(
          nextMembers.find((member) => member.role === "chairman")?.id ??
            nextMembers[0]?.id ??
            null,
        );
        setHadWaiting(false);
        setHadError(false);
        setWasInterrupted(false);
        setStageTimeline([]);
        setActiveTab("live");
        return;
      }

      if (event.type === "stage.started") {
        setSessionState("running");
        setActiveStage(event.stage);
        setSessionFeed((prev) =>
          [
            event.summary?.trim() ||
              `${event.stage.replaceAll("_", " ")} started.`,
            ...prev,
          ].slice(0, 16),
        );
        return;
      }

      if (event.type === "stage.completed") {
        setCompletedStages((prev) => new Set([...prev, event.stage]));
        setActiveStage((current) => (current === event.stage ? null : current));
        setStageTimeline((prev) =>
          upsertTimelineEntry(prev, event.stage, event.summary),
        );
        setSessionFeed((prev) =>
          [
            event.summary?.trim() ||
              `${event.stage.replaceAll("_", " ")} completed.`,
            ...prev,
          ].slice(0, 16),
        );
        return;
      }

      if (event.type === "member.started") {
        const status = event.activity ?? "thinking";
        setMembers((prev) =>
          updateMemberState(prev, event.memberId, status, event.detail),
        );
        setSelectedMemberId((current) => current ?? event.memberId);
        return;
      }

      if (event.type === "member.completed") {
        setMembers((prev) =>
          updateMemberState(prev, event.memberId, "done", event.detail),
        );
        return;
      }

      if (event.type === "member.waiting") {
        const reason =
          event.reason?.trim() || `${event.memberId} needs clarification.`;
        setMembers((prev) =>
          updateMemberState(prev, event.memberId, "waiting", reason),
        );
        setSessionState("awaiting_input");
        setLatestQuestion(reason);
        setHadWaiting(true);
        setSelectedMemberId(event.memberId);
        setSessionFeed((prev) => [reason, ...prev].slice(0, 16));
        return;
      }

      if (event.type === "member.error") {
        setMembers((prev) =>
          updateMemberState(prev, event.memberId, "error", event.message),
        );
        setHadError(true);
        setSelectedMemberId(event.memberId);
        setSessionFeed((prev) =>
          [`${event.memberId} hit an error: ${event.message}`, ...prev].slice(
            0,
            16,
          ),
        );
        return;
      }

      if (event.type === "session.completed") {
        const completedAt = event.ts || new Date().toISOString();
        setSessionState("completed");
        setActiveStage(null);
        setCompletedStages(new Set(COUNCIL_STAGE_ORDER));
        setLatestQuestion(null);
        setLastSummary(event.summary?.trim() || null);
        setSessionOutcome({
          finalResponse:
            event.finalResponse?.trim() || event.summary?.trim() || "",
          winningOption: event.winningOption ?? null,
          options: event.options ?? [],
          references: event.references ?? [],
          optionRankings: event.optionRankings ?? [],
          strategyPacket: event.strategyPacket ?? null,
        });
        setMembers((prev) =>
          prev.map((member) => ({
            ...member,
            status: "done",
            statusLabel: "Done",
            tone: "good",
            detail: undefined,
          })),
        );
        setStageTimeline((prev) =>
          upsertTimelineEntry(prev, "final_synthesis", event.summary),
        );
        setSessionFeed((prev) =>
          [
            event.winningOption
              ? `Council session completed. Winner: ${event.winningOption.label} (${event.winningOption.title}).`
              : "Council session completed.",
            ...prev,
          ].slice(0, 16),
        );
        setRunHistory((prev) =>
          [
            {
              runId: event.runId ?? activeRunId ?? createRunId(),
              completedAt,
              headline:
                event.strategyPacket?.decisionLedger.headline ||
                event.winningOption?.title ||
                "Council session completed",
              missionBrief: event.strategyPacket?.missionBrief ?? null,
              winningOptionTitle:
                event.winningOption?.title ||
                event.winningOption?.label ||
                "No winning option",
              judgeNarrative: event.strategyPacket?.judgeNarrative ?? [],
            },
            ...prev,
          ].slice(0, 6),
        );
        setActiveTab("decision");
        return;
      }

      if (event.type === "session.failed") {
        setWasInterrupted(true);
        setSessionState("failed");
        setActiveStage(null);
        setLatestQuestion(null);
        setSessionFeed((prev) =>
          [`Run failed: ${event.message}`, ...prev].slice(0, 16),
        );
      }
    });

    return () => unsubscribe();
  }, [activeConnection.wsUrl, activeRunId, connection]);

  const stageItems = buildCouncilStageRail(
    COUNCIL_STAGE_ORDER,
    activeStage,
    completedStages,
  );
  const missionLogEntries = buildMissionLogEntries(sessionFeed);
  const nextAction = deriveCouncilNextAction(transportState, sessionState);
  const milestone = deriveCouncilMilestone({
    sessionState,
    hadWaiting,
    hadError,
    wasInterrupted,
  });
  const bannerCopy = getCouncilActionBannerCopy(nextAction, {
    transportMessage,
    latestQuestion,
    lastSummary,
  });
  const canRun =
    (transportState === "connected" || transportState === "mock") &&
    sessionState !== "running";
  const canCancel =
    (transportState === "connected" || transportState === "mock") &&
    sessionState === "running";
  const briefReadiness = buildBriefReadiness(form.prompt);
  const selectedMember =
    members.find((member) => member.id === selectedMemberId) ?? null;
  const debatingCount = members.filter(
    (member) =>
      member.status === "debating" ||
      member.status === "reviewing" ||
      member.status === "thinking",
  ).length;
  const completedCount = members.filter(
    (member) => member.status === "done",
  ).length;
  const stageProgress =
    stageItems.length > 0
      ? Math.round(
          (stageItems.filter((item) => item.state === "completed").length /
            stageItems.length) *
            100,
        )
      : 0;
  const judgeNarrative = sessionOutcome?.strategyPacket?.judgeNarrative ?? [];
  const primaryRecommendation =
    sessionOutcome?.strategyPacket?.decisionLedger.recommendation ||
    sessionOutcome?.winningOption?.summary ||
    sessionOutcome?.finalResponse ||
    lastSummary ||
    "Start a council run to generate a recommendation the judges can evaluate.";

  function handleApplyConnection(): void {
    const normalized = normalizeForm(form);
    setForm(normalized);
    setActiveConnection(toActiveConnection(normalized));
  }

  function handleStartRun(): void {
    const rawPrompt = form.prompt.trim();
    if (!rawPrompt) {
      setTransportMessage(
        "Enter a mission prompt before starting the council.",
      );
      return;
    }
    if (!canRun) {
      setTransportMessage(
        "Wait for the current run to finish or reconnect first.",
      );
      return;
    }
    const content =
      nextAction === "clarify" || nextAction === "rerun"
        ? composeFollowUpPrompt(rawPrompt, latestQuestion, lastSummary)
        : rawPrompt;
    const runId = createRunId();
    connection.send({ type: "run", runId, content });
    setActiveRunId(runId);
    setSessionState("running");
    setTransportMessage(`Run started (${runId}).`);
    setOperatorOpen(false);
  }

  function handleCancelRun(): void {
    connection.send(
      activeRunId ? { type: "cancel", runId: activeRunId } : { type: "cancel" },
    );
    setWasInterrupted(true);
    setSessionState("failed");
    setTransportMessage("Cancellation requested.");
  }

  function handlePrimaryAction(): void {
    if (nextAction === "connect") {
      handleApplyConnection();
      return;
    }
    handleStartRun();
  }

  function renderInsightPanel() {
    switch (activeTab) {
      case "decision":
        return (
          <CouncilOutcomePanel
            outcome={sessionOutcome}
            emptyText="The final synthesis, winning option, and decision packet will appear here after the council completes a run."
            activeStage={activeStage}
            members={members}
            runHistory={runHistory}
          />
        );
      case "roster":
        return (
          <CouncilRosterPanel
            members={members}
            selectedMemberId={selectedMemberId}
            onSelect={setSelectedMemberId}
          />
        );
      case "log":
        return (
          <CouncilMissionLog
            entries={missionLogEntries}
            emptyText="Recent council events will appear here as the mission unfolds."
            activeStage={activeStage}
            members={members}
            timeline={stageTimeline}
          />
        );
      default:
        return (
          <CouncilProgressPanel
            stageItems={stageItems}
            activeStage={activeStage}
            latestQuestion={latestQuestion}
            lastSummary={lastSummary}
            milestone={milestone}
            members={members}
            sessionState={sessionState}
            timeline={stageTimeline}
            briefReadiness={briefReadiness}
          />
        );
    }
  }

  return (
    <div className="cometroom-desktop-root">
      <div className="cometroom-ambient-orb cometroom-ambient-orb-a" />
      <div className="cometroom-ambient-orb cometroom-ambient-orb-b" />

      <header className="cometroom-command-bar">
        <div className="cometroom-command-brand">
          <span className="cometroom-command-kicker">Judge Mode</span>
          <strong>CometRoom</strong>
          <p>Multi-model debate, one defensible recommendation.</p>
        </div>

        <div className="cometroom-command-stages">
          {stageItems.map((item) => (
            <div
              key={item.stage}
              className={`cometroom-stage-pill is-${item.state}`}
            >
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="cometroom-command-actions">
          <div className={`cometroom-status-pill is-${transportState}`}>
            {transportLabel(transportState)}
          </div>
          <button
            type="button"
            className="cometroom-button cometroom-button-secondary"
            onClick={() => setOperatorOpen((current) => !current)}
          >
            {operatorOpen ? "Close Operator" : "Open Operator"}
          </button>
        </div>
      </header>

      <main className="cometroom-judge-grid">
        <section className="cometroom-brief-column">
          <div className="cometroom-hero-panel">
            <span className="cometroom-section-kicker">Mission Brief</span>
            <h1>Present the room like a strategy engine, not a dashboard.</h1>
            <p>
              Judges should instantly understand the mission, the active stage,
              and the recommendation. Everything else is secondary.
            </p>

            <label className="cometroom-field">
              <span>Pitch To The Council</span>
              <textarea
                value={form.prompt}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, prompt: event.target.value }))
                }
                placeholder="Ask the council for a plan, critique, or decision."
              />
            </label>

            <div className="cometroom-hero-actions">
              <button
                type="button"
                className="cometroom-button cometroom-button-primary"
                onClick={handlePrimaryAction}
                disabled={
                  nextAction === "connect"
                    ? transportState === "connecting"
                    : !canRun
                }
              >
                {primaryActionLabel(nextAction)}
              </button>
              <button
                type="button"
                className="cometroom-button cometroom-button-secondary"
                onClick={handleCancelRun}
                disabled={!canCancel}
              >
                Cancel Run
              </button>
            </div>

            <p className="cometroom-helper-copy">
              Include the objective, success criteria, and hard constraints. The
              room tells a stronger story when the brief is specific.
            </p>
          </div>

          <CouncilActionBanner
            copy={bannerCopy}
            onAction={bannerCopy.actionLabel ? handlePrimaryAction : undefined}
            actionDisabled={
              nextAction === "connect"
                ? transportState === "connecting"
                : !canRun
            }
          />

          <div className="cometroom-stat-grid">
            <article className="cometroom-stat-card">
              <span>Session</span>
              <strong>{sessionLabel(sessionState)}</strong>
              <small>{transportMessage}</small>
            </article>
            <article className="cometroom-stat-card">
              <span>Active Stage</span>
              <strong>
                {activeStage ? COUNCIL_STAGE_LABELS[activeStage] : "Standby"}
              </strong>
              <small>{stageProgress}% complete</small>
            </article>
            <article className="cometroom-stat-card">
              <span>Focused Member</span>
              <strong>{selectedMember?.displayName || "Lead Synth"}</strong>
              <small>{selectedMember?.statusLabel || "Ready"}</small>
            </article>
            <article className="cometroom-stat-card">
              <span>Run ID</span>
              <strong>{formatRunId(activeRunId)}</strong>
              <small>{briefReadiness}% brief readiness</small>
            </article>
          </div>

          <div className="cometroom-recommendation-panel">
            <span className="cometroom-section-kicker">Executive Readout</span>
            <h2>
              {sessionOutcome?.winningOption?.title || "Recommendation loading"}
            </h2>
            <p>{primaryRecommendation}</p>
            <div className="cometroom-recommendation-meta">
              <span>
                {completedCount}/{Math.max(members.length, 1)} members locked
              </span>
              <span>{debatingCount} active contributors</span>
              <span>{Math.round((form.roomZoom / 3.5) * 100)}% room zoom</span>
            </div>
          </div>
        </section>

        <section className="cometroom-room-column">
          <div className="cometroom-room-stage">
            <div className="cometroom-room-headline">
              <div>
                <span className="cometroom-section-kicker">
                  Live Council Arena
                </span>
                <h2>
                  {activeStage
                    ? `${COUNCIL_STAGE_LABELS[activeStage]} is live`
                    : sessionState === "completed"
                      ? "Decision ready for judges"
                      : "Council standing by"}
                </h2>
              </div>
              <div className="cometroom-room-headline-badges">
                <span
                  className={`cometroom-mini-pill tone-${milestone === "interrupted" ? "error" : milestone === "clarified" ? "warn" : milestone === "flawless" ? "good" : "accent"}`}
                >
                  {milestone === "interrupted"
                    ? "Interrupted"
                    : milestone === "clarified"
                      ? "Clarified"
                      : milestone === "flawless"
                        ? "Flawless"
                        : "Live"}
                </span>
                <span className="cometroom-mini-pill tone-neutral">
                  {members.length} members
                </span>
              </div>
            </div>

            <div className="cometroom-room-frame">
              <PixelCouncilRoom
                connection={connection}
                title="CometRoom"
                subtitle="AI council arena"
                zoom={form.roomZoom}
                selectedMemberId={selectedMemberId}
                onMemberSelect={setSelectedMemberId}
                showHeader={false}
                showSidebar={false}
              />

              <div className="cometroom-room-overlay cometroom-room-overlay-top">
                <strong>{selectedMember?.displayName || "Lead Synth"}</strong>
                <span>
                  {selectedMember?.detail ||
                    selectedMember?.statusLabel ||
                    "Monitoring the room."}
                </span>
              </div>

              <div className="cometroom-room-overlay cometroom-room-overlay-bottom">
                <strong>
                  {sessionOutcome?.winningOption?.label ||
                    (latestQuestion
                      ? "Clarification request"
                      : "Recommendation stream")}
                </strong>
                <span>
                  {latestQuestion ||
                    sessionOutcome?.winningOption?.summary ||
                    "The room will surface its strongest option here once the council converges."}
                </span>
              </div>
            </div>
          </div>

          {judgeNarrative.length > 0 || stageTimeline.length > 0 ? (
            <section className="cometroom-judge-script">
              <div className="cometroom-script-head">
                <span className="cometroom-section-kicker">Judge Script</span>
                <h3>What to say while this is on screen</h3>
              </div>
              <div className="cometroom-script-grid">
                {(judgeNarrative.length > 0
                  ? judgeNarrative
                  : stageTimeline.map((entry) => entry.summary)
                )
                  .slice(0, 3)
                  .map((line, index) => (
                    <article
                      key={`${line}-${index}`}
                      className="cometroom-script-card"
                    >
                      <span>0{index + 1}</span>
                      <p>{line}</p>
                    </article>
                  ))}
              </div>
            </section>
          ) : null}
        </section>

        <section className="cometroom-insight-column">
          <div className="cometroom-insight-head">
            <div>
              <span className="cometroom-section-kicker">Insight Stack</span>
              <h2>Secondary evidence, only when needed</h2>
            </div>
            <div className="cometroom-tab-row">
              {JUDGE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`cometroom-tab-button ${activeTab === tab.id ? "is-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cometroom-insight-body">{renderInsightPanel()}</div>
        </section>
      </main>

      <aside
        className={`cometroom-operator-drawer ${operatorOpen ? "is-open" : ""}`}
      >
        <div className="cometroom-operator-panel">
          <div className="cometroom-operator-head">
            <div>
              <span className="cometroom-section-kicker">Operator Panel</span>
              <h2>Connection and presentation controls</h2>
            </div>
            <button
              type="button"
              className="cometroom-button cometroom-button-secondary"
              onClick={() => setOperatorOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="cometroom-launch-status">
            <div className="cometroom-launch-summary">
              <div>
                <strong>Transport</strong>
                <span>{transportState.toUpperCase()}</span>
              </div>
              <div>
                <strong>Session</strong>
                <span>{sessionState.replaceAll("_", " ").toUpperCase()}</span>
              </div>
              <div>
                <strong>Run</strong>
                <span>{formatRunId(activeRunId)}</span>
              </div>
              <div>
                <strong>Room Zoom</strong>
                <span>{Math.round((form.roomZoom / 3.5) * 100)}%</span>
              </div>
            </div>
            <p className="cometroom-window-message">{transportMessage}</p>
          </div>

          <div className="cometroom-demo-advanced-grid">
            <label className="council-field">
              <span>Council WebSocket</span>
              <input
                value={form.wsUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, wsUrl: event.target.value }))
                }
                placeholder="ws://127.0.0.1:8001/v1/council-room/ws"
              />
            </label>

            <label className="council-field">
              <span>Room Zoom</span>
              <select
                value={String(form.roomZoom)}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    roomZoom: Number(event.target.value),
                  }))
                }
              >
                {ROOM_ZOOM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {Math.round((option / 3.5) * 100)}%
                  </option>
                ))}
              </select>
            </label>

            <div className="cometroom-demo-envnote">
              {COUNCIL_TOKEN
                ? "API token loaded from .env."
                : "No VITE_COUNCIL_TOKEN found. Add it to .env if the council websocket requires auth."}
            </div>

            <div className="cometroom-demo-advanced-actions">
              <button
                type="button"
                className="cometroom-button cometroom-button-primary"
                onClick={handleApplyConnection}
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
