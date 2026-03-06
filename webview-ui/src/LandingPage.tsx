import { useEffect, useRef } from 'react'
import { Icon, addCollection } from '@iconify/react'
import { icons as pixelarticonsData } from '@iconify-json/pixelarticons'
import './landing-page.css'
import { PixelBadge } from './lib/PixelBadge.js'

let _iconsReady = false
function ensureIcons() {
  if (_iconsReady) return
  addCollection(pixelarticonsData)
  _iconsReady = true
}

function openCouncilSession(): void {
  const params = new URLSearchParams(window.location.search)
  params.set('mode', 'council')
  window.location.search = params.toString()
}

function scrollToShowcase(): void {
  const target = document.getElementById('comet-landing-showcase')
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const AGENT_ICONS: Record<number, string> = {
  0: 'pixelarticons:crown',
  1: 'pixelarticons:robot',
  2: 'pixelarticons:robot-face',
  3: 'pixelarticons:cpu',
  4: 'pixelarticons:ai-user-circle',
  5: 'pixelarticons:circuit-board',
}

function PixelIcon({
  icon,
  size = 20,
  label,
  className,
}: {
  icon: string
  size?: number
  label?: string
  className?: string
}) {
  ensureIcons()
  return (
    <span
      aria-label={label}
      title={label}
      className={`pixel-icon-frame ${className ?? ''}`.trim()}
    >
      <Icon icon={icon} width={size} height={size} />
    </span>
  )
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 100
      const y = (event.clientY / window.innerHeight) * 100
      root.style.setProperty('--landing-mx', `${x}%`)
      root.style.setProperty('--landing-my', `${y}%`)
    }
    window.addEventListener('mousemove', onMove)

    // Root app layout defaults to overflow hidden for editor mode.
    // Landing mode explicitly enables page scrolling.
    document.documentElement.classList.add('landing-scroll-open')
    document.body.classList.add('landing-scroll-open')
    document.getElementById('root')?.classList.add('landing-scroll-open')

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.classList.remove('landing-scroll-open')
      document.body.classList.remove('landing-scroll-open')
      document.getElementById('root')?.classList.remove('landing-scroll-open')
    }
  }, [])

  return (
    <div ref={rootRef} className="landing-root">
      <div className="landing-scanlines" />
      <div className="landing-stars" />
      <div className="landing-noise" />

      <header className="landing-nav">
        <div className="landing-logo">
          <span className="landing-logo-dot" />
          AI DECISION COUNCIL
        </div>
        <nav className="landing-nav-links">
          <a href="#comet-landing-showcase"><PixelIcon icon="pixelarticons:briefcase" size={16} label="Showcase" /> Command Assets</a>
          <a href="#comet-landing-workflow"><PixelIcon icon="pixelarticons:bulletlist" size={16} label="Workflow" /> Protocol</a>
          <a href="#comet-landing-proof"><PixelIcon icon="pixelarticons:chart-bar" size={16} label="Proof" /> Metrics</a>
        </nav>
        <button type="button" className="landing-nav-cta" onClick={openCouncilSession}>
          Enter Council
        </button>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy reveal-up delay-0">
            <span className="landing-kicker">Structured Multi-Model Deliberation</span>
            <h1>
              The Council
              <br />
              Convenes
            </h1>
            <p>
              Multi-Model Deliberation. One Decisive Answer. Complete Transparency.
            </p>
            <div className="pixel-badge-row landing-badge-row">
              <PixelBadge icon="pixelarticons:shield" label="Judge Ready" tone="good" />
              <PixelBadge icon="pixelarticons:chart-bar" label="Live Telemetry" tone="accent" />
              <PixelBadge icon="pixelarticons:briefcase" label="War Room Ops" tone="warn" />
            </div>
            <div className="landing-hero-icons">
              {[0, 1, 2, 3, 4, 5].map((slot) => (
                <PixelIcon
                  key={slot}
                  icon={AGENT_ICONS[slot]}
                  size={22}
                  label={slot === 0 ? 'Lead Synth' : `Model ${String.fromCharCode(64 + slot)}`}
                  className="is-large"
                />
              ))}
            </div>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary-btn" onClick={openCouncilSession}>
                Convene Session
              </button>
              <button type="button" className="landing-secondary-btn" onClick={scrollToShowcase}>
                View Protocol
              </button>
            </div>
          </div>

          <div className="landing-hero-visual reveal-up delay-1">
            <div className="landing-visual-glow" />
            <div className="landing-warroom-art" />
            <div className="landing-control-card">
              <div className="landing-control-head">
                <span>Live Deliberation</span>
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
                  <PixelIcon icon="pixelarticons:crown" size={20} label="Lead Synth" className="avatar-icon leader" />
                  <strong>Lead Synth</strong>
                  <small>Synthesizing</small>
                </article>
                <article>
                  <PixelIcon icon="pixelarticons:robot" size={20} label="Model A" className="avatar-icon a" />
                  <strong>Model A</strong>
                  <small>Debating</small>
                </article>
                <article>
                  <PixelIcon icon="pixelarticons:robot-face" size={20} label="Model B" className="avatar-icon b" />
                  <strong>Model B</strong>
                  <small>Reviewing</small>
                </article>
                <article>
                  <PixelIcon icon="pixelarticons:cpu" size={20} label="Model C" className="avatar-icon c" />
                  <strong>Model C</strong>
                  <small>Voting</small>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="comet-landing-showcase" className="landing-section reveal-up delay-2">
          <div className="section-head">
            <span>Why Judges Say Wow</span>
            <h2>Command Assets — Built For Impact</h2>
          </div>
          <div className="landing-pixel-gallery">
            <img src="/assets/furniture/desks/jik-office-boss-desk.png" alt="Council desk" />
            <img src="/assets/furniture/chairs/jik-office-boss-chair.png" alt="Command chair" />
            <img src="/assets/furniture/storage/jik-office-bookshelf.png" alt="Council archives" />
            <img src="/assets/furniture/storage/jik-office-big-filing-cabinet.png" alt="Filing cabinet" />
            <img src="/assets/furniture/desks/jik-office-small-table.png" alt="Briefing table" />
            <img src="/assets/furniture/storage/jik-office-books.png" alt="Reference books" />
          </div>
          <div className="landing-feature-grid">
            <article className="feature-card">
              <h3>Story-First UX</h3>
              <p>From mission launch to final synthesis, every panel reinforces what is happening now and what happens next.</p>
            </article>
            <article className="feature-card">
              <h3>Transparent AI Reasoning</h3>
              <p>Stage progression, member statuses, and mission logs make deliberation visible instead of a black box.</p>
            </article>
            <article className="feature-card">
              <h3>Game-Grade Motion</h3>
              <p>Pixel scanlines, animated stage chips, depth glows, and staggered reveals create an unforgettable first impression.</p>
            </article>
            <article className="feature-card">
              <h3>Startup-Ready Positioning</h3>
              <p>The landing experience instantly communicates product value, confidence, and execution quality to investors and judges.</p>
            </article>
          </div>
          <div className="pixel-badge-row landing-badge-row">
            <PixelBadge icon="pixelarticons:monitor" label="Room Command" tone="accent" />
            <PixelBadge icon="pixelarticons:message" label="Council Dialogue" tone="neutral" />
            <PixelBadge icon="pixelarticons:check-double" label="Outcome Locked" tone="good" />
          </div>
        </section>

        <section id="comet-landing-workflow" className="landing-section reveal-up delay-3">
          <div className="section-head">
            <span>Council Flow</span>
            <h2>Council Protocol — Stage By Stage</h2>
          </div>
          <div className="landing-workflow">
            <article>
              <b>01</b>
              <h3>Brief The Mission</h3>
              <p>Set the question. The Council assembles on full alert.</p>
            </article>
            <article>
              <b>02</b>
              <h3>Watch The Deliberation</h3>
              <p>All models debate in parallel — anonymized, ranked, reviewed.</p>
            </article>
            <article>
              <b>03</b>
              <h3>Chairman Delivers</h3>
              <p>One final, authoritative synthesis from the designated chairman.</p>
            </article>
          </div>
        </section>

        <section id="comet-landing-proof" className="landing-section landing-proof reveal-up delay-4">
          <div className="section-head">
            <span>Proof Of Quality</span>
            <h2>Engineered To Production Grade</h2>
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
              <strong>100%</strong>
              <span>Scenario Check Pass</span>
            </div>
            <div>
              <strong>Real-time</strong>
              <span>Mission Telemetry</span>
            </div>
          </div>
          <button type="button" className="landing-primary-btn landing-final-cta" onClick={openCouncilSession}>
            Enter The Council Room
          </button>
        </section>
      </main>
    </div>
  )
}
