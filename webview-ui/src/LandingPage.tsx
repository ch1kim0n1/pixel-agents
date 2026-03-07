import { useEffect, useRef } from "react";
import { Icon, addCollection } from "@iconify/react";
import { icons as pixelarticonsData } from "@iconify-json/pixelarticons";
import "./landing-page.css";
import { PixelBadge } from "./lib/PixelBadge.js";

let _iconsReady = false;
function ensureIcons() {
  if (_iconsReady) return;
  addCollection(pixelarticonsData);
  _iconsReady = true;
}

function openCouncilSession(): void {
  const params = new URLSearchParams(window.location.search);
  params.set("mode", "council");
  window.location.search = params.toString();
}

function scrollToShowcase(): void {
  const target = document.getElementById("comet-landing-showcase");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

const AGENT_ICONS: Record<number, string> = {
  0: "pixelarticons:crown",
  1: "pixelarticons:robot",
  2: "pixelarticons:robot-face",
  3: "pixelarticons:cpu",
  4: "pixelarticons:ai-user-circle",
  5: "pixelarticons:circuit-board",
};

function PixelIcon({
  icon,
  size = 20,
  label,
  className,
}: {
  icon: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  ensureIcons();
  return (
    <span
      aria-label={label}
      title={label}
      className={`pixel-icon-frame ${className ?? ""}`.trim()}
    >
      <Icon icon={icon} width={size} height={size} />
    </span>
  );
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 100;
      const y = (event.clientY / window.innerHeight) * 100;
      root.style.setProperty("--landing-mx", `${x}%`);
      root.style.setProperty("--landing-my", `${y}%`);
    };
    window.addEventListener("mousemove", onMove);

    // Root app layout defaults to overflow hidden for editor mode.
    // Landing mode explicitly enables page scrolling.
    document.documentElement.classList.add("landing-scroll-open");
    document.body.classList.add("landing-scroll-open");
    document.getElementById("root")?.classList.add("landing-scroll-open");

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.classList.remove("landing-scroll-open");
      document.body.classList.remove("landing-scroll-open");
      document.getElementById("root")?.classList.remove("landing-scroll-open");
    };
  }, []);

  return (
    <div ref={rootRef} className="landing-root">
      <div className="landing-scanlines" />
      <div className="landing-stars" />
      <div className="landing-noise" />

      <header className="landing-nav">
        <div className="landing-logo">
          <span className="landing-logo-dot" />
          COMETROOM
        </div>
        <nav className="landing-nav-links">
          <a href="#comet-landing-showcase">
            <PixelIcon
              icon="pixelarticons:briefcase"
              size={16}
              label="Showcase"
            />{" "}
            What Judges See
          </a>
          <a href="#comet-landing-workflow">
            <PixelIcon
              icon="pixelarticons:bulletlist"
              size={16}
              label="Workflow"
            />{" "}
            Decision Flow
          </a>
          <a href="#comet-landing-proof">
            <PixelIcon icon="pixelarticons:chart-bar" size={16} label="Proof" />{" "}
            Proof
          </a>
        </nav>
        <button
          type="button"
          className="landing-nav-cta"
          onClick={openCouncilSession}
        >
          Open Judge Mode
        </button>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy reveal-up delay-0">
            <span className="landing-kicker">Visible AI Deliberation</span>
            <h1>
              Seven Models.
              <br />
              One Boardroom Call.
            </h1>
            <p>
              CometRoom turns an AI answer into a judge-ready moment with live
              debate, dissent, vote reveal, and a 7-day execution plan on one
              screen.
            </p>
            <div className="pixel-badge-row landing-badge-row">
              <PixelBadge
                icon="pixelarticons:message"
                label="Disagreement Visible"
                tone="warn"
              />
              <PixelBadge
                icon="pixelarticons:chart-bar"
                label="Vote Reveal"
                tone="accent"
              />
              <PixelBadge
                icon="pixelarticons:check-double"
                label="Action Plan Ready"
                tone="good"
              />
            </div>
            <div className="landing-hero-icons">
              {[0, 1, 2, 3, 4, 5].map((slot) => (
                <PixelIcon
                  key={slot}
                  icon={AGENT_ICONS[slot]}
                  size={22}
                  label={
                    slot === 0
                      ? "Lead Synth"
                      : `Model ${String.fromCharCode(64 + slot)}`
                  }
                  className="is-large"
                />
              ))}
            </div>
            <div className="landing-hero-actions">
              <button
                type="button"
                className="landing-primary-btn"
                onClick={openCouncilSession}
              >
                Open Live Council
              </button>
              <button
                type="button"
                className="landing-secondary-btn"
                onClick={scrollToShowcase}
              >
                See The Evidence
              </button>
            </div>
          </div>

          <div className="landing-hero-visual reveal-up delay-1">
            <div className="landing-visual-glow" />
            <div className="landing-warroom-art" />
            <div className="landing-control-card">
              <div className="landing-control-head">
                <span>Live Council Run</span>
                <span className="landing-live-pill">RUNNING</span>
              </div>
              <div className="landing-stage-track">
                <span className="is-done">First Opinions</span>
                <span className="is-done">Review</span>
                <span className="is-active">Debate</span>
                <span>Options</span>
                <span>Vote</span>
                <span>Final Synthesis</span>
              </div>
              <div className="landing-agent-grid">
                <article>
                  <PixelIcon
                    icon="pixelarticons:crown"
                    size={20}
                    label="Lead Synth"
                    className="avatar-icon leader"
                  />
                  <strong>Lead Synth</strong>
                  <small>Synthesizing</small>
                </article>
                <article>
                  <PixelIcon
                    icon="pixelarticons:robot"
                    size={20}
                    label="Model A"
                    className="avatar-icon a"
                  />
                  <strong>Model A</strong>
                  <small>Debating</small>
                </article>
                <article>
                  <PixelIcon
                    icon="pixelarticons:robot-face"
                    size={20}
                    label="Model B"
                    className="avatar-icon b"
                  />
                  <strong>Model B</strong>
                  <small>Reviewing</small>
                </article>
                <article>
                  <PixelIcon
                    icon="pixelarticons:cpu"
                    size={20}
                    label="Model C"
                    className="avatar-icon c"
                  />
                  <strong>Model C</strong>
                  <small>Voting</small>
                </article>
              </div>
              <div className="landing-decision-readout">
                <div>
                  <span>Winning Option</span>
                  <strong>
                    Ship the live council room as the hero product, not the
                    supporting UI.
                  </strong>
                </div>
                <p>
                  Red-team note: avoid looking like a dashboard collection. The
                  room itself has to carry the demo.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="comet-landing-showcase"
          className="landing-section reveal-up delay-2"
        >
          <div className="section-head">
            <span>What Judges Actually See</span>
            <h2>One Decision Artifact, Not Five Competing Panels</h2>
          </div>
          <div className="landing-proof-tape">
            <div>
              <strong>6</strong>
              <span>Decision stages</span>
            </div>
            <div>
              <strong>7</strong>
              <span>Visible council members</span>
            </div>
            <div>
              <strong>1</strong>
              <span>Winning option</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Judge talking points</span>
            </div>
          </div>
          <div className="landing-decision-board">
            <article className="decision-card is-winning">
              <span>Winning Option</span>
              <h3>Ship the council room as the product surface</h3>
              <p>
                Use the live room, stage rail, and outcome deck as the main
                story. Remove anything that dilutes the moment.
              </p>
            </article>
            <article className="decision-card">
              <span>Dissent</span>
              <h3>Do not let premium chrome overpower the pixel identity</h3>
              <p>
                The council feels original when the overlays look like tactical
                instrumentation, not SaaS glass cards.
              </p>
            </article>
            <article className="decision-card">
              <span>Next 7 Days</span>
              <h3>Launch, validate, then package the decision trail</h3>
              <p>
                Show the brief, the conflict, the winner, and the action plan in
                one uninterrupted arc.
              </p>
            </article>
          </div>
          <div className="landing-feature-grid">
            <article className="feature-card">
              <h3>Boardroom Legibility</h3>
              <p>
                The interface explains the mission, the current debate, and the
                final recommendation in seconds.
              </p>
            </article>
            <article className="feature-card">
              <h3>Transparent Reasoning</h3>
              <p>
                Stages, member states, dissent, and final vote make the AI
                process inspectable instead of mystical.
              </p>
            </article>
            <article className="feature-card">
              <h3>Memorable Presentation</h3>
              <p>
                The pixel war-room gives the project identity instead of falling
                into another anonymous AI dashboard.
              </p>
            </article>
            <article className="feature-card">
              <h3>Decision-Ready Output</h3>
              <p>
                The room ends on a winning option, why it won, and what the team
                should do next.
              </p>
            </article>
          </div>
          <div className="pixel-badge-row landing-badge-row">
            <PixelBadge
              icon="pixelarticons:monitor"
              label="Live War Room"
              tone="accent"
            />
            <PixelBadge
              icon="pixelarticons:message"
              label="Debate Evidence"
              tone="neutral"
            />
            <PixelBadge
              icon="pixelarticons:check-double"
              label="Winner Locked"
              tone="good"
            />
          </div>
        </section>

        <section
          id="comet-landing-workflow"
          className="landing-section reveal-up delay-3"
        >
          <div className="section-head">
            <span>Decision Flow</span>
            <h2>The Demo Arc Judges Can Follow Instantly</h2>
          </div>
          <div className="landing-workflow">
            <article>
              <b>01</b>
              <h3>Frame The Call</h3>
              <p>
                Write one crisp mission with the outcome, constraints, and
                success criteria the room should optimize for.
              </p>
            </article>
            <article>
              <b>02</b>
              <h3>Watch The Conflict</h3>
              <p>
                Models debate in parallel, challenge assumptions, and surface
                dissent instead of collapsing to consensus too early.
              </p>
            </article>
            <article>
              <b>03</b>
              <h3>Land The Decision</h3>
              <p>
                The chairman delivers one final recommendation, the reason it
                won, and an immediate execution plan.
              </p>
            </article>
          </div>
        </section>

        <section
          id="comet-landing-proof"
          className="landing-section landing-proof reveal-up delay-4"
        >
          <div className="section-head">
            <span>Proof Of Quality</span>
            <h2>Concrete Claims Backed By The Interface</h2>
          </div>
          <div className="landing-proof-grid">
            <div>
              <strong>6</strong>
              <span>Council Stages</span>
            </div>
            <div>
              <strong>7</strong>
              <span>Active Agents</span>
            </div>
            <div>
              <strong>1</strong>
              <span>Winning Recommendation</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Judge Narrative Lines</span>
            </div>
          </div>
          <button
            type="button"
            className="landing-primary-btn landing-final-cta"
            onClick={openCouncilSession}
          >
            Enter The Council Room
          </button>
        </section>
      </main>
    </div>
  );
}
