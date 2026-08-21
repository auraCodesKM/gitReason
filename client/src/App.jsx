import { useEffect, useMemo, useRef, useState } from "react";
import { Agentation } from "agentation";
import { roughLine, variants } from "drawably";
import { DrawablyButton } from "drawably/react";
import "drawably/style.css";
import "./sections/sections-base.css";
import Problem from "./sections/Problem";
import Understand from "./sections/Understand";
import HowItWorks from "./sections/HowItWorks";
import ArchitectureViz from "./sections/ArchitectureViz";
import RiskImpact from "./sections/RiskImpact";
import AskCodebase from "./sections/AskCodebase";
import TechFoundation from "./sections/TechFoundation";
import FinalCTA from "./sections/FinalCTA";
import Footer from "./sections/Footer";
import { LogoMark } from "./sections/LogoMark";
import { SectionDoodle } from "./sections/SectionDoodle";
import { useRepoCheck } from "./sections/useRepoCheck";
import { normalizeRepoInput } from "./lib/repo";
import { apiFetch } from "./lib/api";

const NAV_LINKS = [
  { label: "Understand", href: "#understand", mod: "appear--scale", d: "0.16s" },
  { label: "How It Works", href: "#how-it-works", mod: "appear--soft", d: "0.28s" },
  { label: "Ask Codebase", href: "#ask", mod: "appear--scale", d: "0.40s" },
  { label: "Get Started", href: "#start", mod: "appear--soft", d: "0.52s" },
];

function SparkleIcon() {
  return (
    <svg className="badge-star" width="18" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="sparkle-metal" x1="4" y1="2" x2="20" y2="22">
          <stop offset="0" stopColor="#fff6d8" />
          <stop offset="0.35" stopColor="#d9a635" />
          <stop offset="0.55" stopColor="#fce8a4" />
          <stop offset="0.78" stopColor="#b9822a" />
          <stop offset="1" stopColor="#f3d27f" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z"
        fill="url(#sparkle-metal)"
      />
    </svg>
  );
}

function WorkflowStatIcon() {
  return (
    <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="wf-left" x1="3" y1="2" x2="14" y2="22">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#3a3a3a" stopOpacity="0.62" />
        </linearGradient>
        <linearGradient id="wf-right" x1="3" y1="2" x2="14" y2="22">
          <stop offset="0" stopColor="#3a3a3a" stopOpacity="0.38" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.62" />
        </linearGradient>
      </defs>
      <rect x="3.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="url(#wf-left)" />
      <rect x="13.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="url(#wf-right)" />
      <rect x="9.2" y="10.9" width="5.6" height="2.2" rx="1.1" fill="#4a4a4a" />
    </svg>
  );
}

function DownloadStatIcon() {
  return (
    <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="6.2" fill="#ffffff" />
      <path d="M12 7.1v7.4" stroke="#111" strokeWidth="1.85" strokeLinecap="round" fill="none" />
      <path d="M8.15 12.35L12 16.2l3.85-3.85" stroke="#111" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function AvatarsStatIcon() {
  return (
    <svg className="stat-icon-wide" width="40" height="22" viewBox="0 0 40 22" aria-hidden="true">
      <circle cx="10.2" cy="11" r="9.2" fill="#2b2b2b" />
      <ellipse cx="10.2" cy="12.1" rx="4.15" ry="4.6" fill="#f4f4f4" />
      <path d="M6.6 6.4L8.6 9" stroke="#f4f4f4" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M13.8 6.4L11.8 9" stroke="#f4f4f4" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8.7" cy="12" r="0.7" fill="#1a1a1a" />
      <circle cx="11.7" cy="12" r="0.7" fill="#1a1a1a" />

      <circle cx="20.2" cy="11" r="9.2" fill="#ffffff" />
      <circle cx="18" cy="10.8" r="1.7" fill="#111111" />
      <circle cx="22.4" cy="10.8" r="1.7" fill="#111111" />
      <ellipse cx="20.2" cy="13.4" rx="1.1" ry="0.8" fill="#c9c9c9" />
      <path d="M17.4 15.2Q20.2 17.6 23 15.2" stroke="#111" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      <circle cx="30.2" cy="11" r="9.2" fill="#f26b1d" />
      <text x="30.2" y="15.1" fontFamily="Inter, sans-serif" fontSize="12.5" fontWeight="700" fill="#ffffff" textAnchor="middle">e</text>
    </svg>
  );
}

const FEATURES = [
  { glyph: "<", value: "Architecture Graph", label: "Maps structure" },
  { glyph: "%", value: "Code RAG", label: "Grounded retrieval" },
  { glyph: "*", value: "Git Risk Analysis", label: "Change risk" },
  { glyph: "#", value: "Impact Analysis", label: "Blast radius" },
];

function useScrollReveal() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in-view");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in-view");
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function useAppearFallback() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".appear, .hero-photo"));

    const handlers = elements.map((el) => {
      const onEnd = () => el.classList.add("is-in");
      el.addEventListener("animationend", onEnd, { once: true });
      return [el, onEnd];
    });

    let raf1 = requestAnimationFrame(() => {
      let raf2 = requestAnimationFrame(() => {
        elements.forEach((el) => {
          const anims = typeof el.getAnimations === "function" ? el.getAnimations() : [];
          const active = anims.some((a) => a.playState === "running" || a.playState === "finished");
          if (!active) el.classList.add("is-in");
        });
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => {
      cancelAnimationFrame(raf1);
      handlers.forEach(([el, onEnd]) => el.removeEventListener("animationend", onEnd));
    };
  }, []);
}

function useMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    function onResize() {
      if (window.matchMedia("(min-width: 901px)").matches && open) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return [open, setOpen];
}

function DrawnUnderline({ className = "headline-underline", seed = 42, strokeWidth = "3" }) {
  const paths = useMemo(
    () => variants((o) => roughLine(4, 9, 196, 11, o), { seed, roughness: 1.1, boil: 0.6 }, 3),
    [seed]
  );
  return (
    <svg className={className} viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          className="drawably-boil"
          data-i={i}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function useHeaderScrolled(enterAt = 64, exitAt = 24) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    function apply() {
      ticking = false;
      setScrolled((prev) => {
        const y = window.scrollY;
        if (!prev && y > enterAt) return true;
        if (prev && y < exitAt) return false;
        return prev;
      });
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enterAt, exitAt]);

  return scrolled;
}

function RepoArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  useAppearFallback();
  const [menuOpen, setMenuOpen] = useMenu();
  const headerScrolled = useHeaderScrolled();
  const videoRef = useRef(null);
  const featureStripRef = useScrollReveal();
  const [showRepoInput, setShowRepoInput] = useState(false);
  const [repoValue, setRepoValue] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const { repoStatus, checkRepo, clearStaleError } = useRepoCheck();

  function handleRepoSubmit(e) {
    e.preventDefault();
    if (!repoValue.trim()) return;
    checkRepo(repoValue);
  }

  useEffect(() => {
    apiFetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setAuthUser(data.authenticated ? data.user : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repo = params.get("repo");
    if (params.get("auth") === "success" && repo) {
      window.history.replaceState({}, "", window.location.pathname);
      setShowRepoInput(true);
      setRepoValue(repo);
      checkRepo(repo);
    }
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onLoadedData = () => el.classList.add("is-in");
    el.addEventListener("loadeddata", onLoadedData, { once: true });

    return () => el.removeEventListener("loadeddata", onLoadedData);
  }, []);

  return (
    <>
      <div className="grain" />
      <video
        ref={videoRef}
        className="hero-photo"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      <header className={`header ${headerScrolled ? "is-scrolled" : ""}`}>
        <a href="#top" className="logo appear appear--scale" style={{ "--d": "0.08s" }} aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>

        <nav className="nav-inline" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`nav-link appear ${link.mod}`}
              style={{ "--d": link.d }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
              <DrawnUnderline className="nav-link-underline" seed={link.href.length * 13 + 5} strokeWidth="2.4" />
            </a>
          ))}
        </nav>

        {authUser ? (
          <a
            href="/dashboard"
            className="header-account appear appear--scale"
            style={{ "--d": "0.34s" }}
          >
            {authUser.avatarUrl && <img src={authUser.avatarUrl} alt="" className="header-account-avatar" />}
            {authUser.username}
          </a>
        ) : (
          <a
            href="/sign"
            className="btn btn-gold header-cta appear appear--scale"
            style={{ "--d": "0.34s" }}
          >
            Sign In / Sign Up
          </a>
        )}

        <button
          type="button"
          className="burger"
          aria-controls="site-nav"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="burger-bars">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </header>

      <nav id="site-nav" aria-label="Primary" className="nav-mobile-sheet">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`nav-link appear ${link.mod}`}
            style={{ "--d": link.d }}
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
            <DrawnUnderline className="nav-link-underline" seed={link.href.length * 13 + 5} strokeWidth="2.4" />
          </a>
        ))}
      </nav>

      <div className="page">
        <div className="menu-backdrop" />

        <main className="hero" id="top">
          <div className="hero-copy">
            <span className="badge appear appear--pop" style={{ "--d": "0.22s" }}>
              <SparkleIcon />
              CODEBASE INTELLIGENCE
            </span>

            <h1>
              <span className="headline-line">
                <span className="appear appear--mask" style={{ "--d": "0.42s" }}>
                  Understand Your <span className="headline-accent"><em>Codebase</em><DrawnUnderline /></span>.
                </span>
              </span>
              <span className="headline-line">
                <span className="appear appear--mask" style={{ "--d": "0.62s" }}>
                  Before You Change It.
                </span>
              </span>
            </h1>

            <p className="lede appear appear--soft" style={{ "--d": "0.82s" }}>
              Map architecture. Trace risk. See what breaks &mdash; before you touch a line.
            </p>

            <div className="hero-actions">
              {showRepoInput ? (
                <>
                  <form className="repo-input" onSubmit={handleRepoSubmit}>
                    <span className="repo-input-prefix">github.com/</span>
                    <input
                      type="text"
                      className="repo-input-field"
                      placeholder="owner/repository"
                      value={repoValue}
                      onChange={(e) => { setRepoValue(normalizeRepoInput(e.target.value)); clearStaleError(); }}
                      onBlur={() => { if (!repoValue.trim()) setShowRepoInput(false); }}
                      disabled={repoStatus === "checking"}
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="repo-input-submit"
                      aria-label="Analyze repository"
                      disabled={repoStatus === "checking"}
                    >
                      <RepoArrowIcon />
                    </button>
                  </form>
                  {repoStatus === "checking" && (
                    <span className="repo-input-error repo-input-hint">Checking repository&hellip;</span>
                  )}
                  {repoStatus === "invalid" && (
                    <span className="repo-input-error">
                      Enter a valid GitHub repository, like owner/repository.
                    </span>
                  )}
                  {repoStatus === "not_found" && (
                    <span className="repo-input-error">
                      Repository not found or still not accessible with this account.
                    </span>
                  )}
                  {repoStatus === "error" && (
                    <span className="repo-input-error">Couldn&rsquo;t reach GitHub. Try again.</span>
                  )}
                  {repoStatus === "rate_limited" && (
                    <span className="repo-input-error">GitHub rate limit reached. Try again shortly.</span>
                  )}
                </>
              ) : (
                <DrawablyButton
                  className="drawn-btn appear appear--btn"
                  style={{ "--d": "0.96s" }}
                  onClick={() => setShowRepoInput(true)}
                >
                  Analyze a Repository
                </DrawablyButton>
              )}
              <a href="#demo" className="btn btn-ghost appear appear--side" style={{ "--d": "1.10s" }}>
                See How It Works
              </a>
            </div>
          </div>
        </main>

        <footer className="stats">
          <span className="stat appear appear--stat" style={{ "--d": "1.12s" }}>
            <WorkflowStatIcon />
            Architecture Graph
          </span>
          <span className="stat appear appear--stat" style={{ "--d": "1.28s" }}>
            <DownloadStatIcon />
            Git Risk Analysis
          </span>
          <span className="stat appear appear--stat" style={{ "--d": "1.44s" }}>
            <AvatarsStatIcon />
            Impact Analysis
          </span>
        </footer>
      </div>

      <SectionDoodle />
      <section className="feature-strip" ref={featureStripRef}>
        <div className="feature-strip-inner">
          {FEATURES.map(({ glyph, value, label }) => (
            <div className="feature-stat" key={value}>
              <span className="feature-stat-icon">{glyph}</span>
              <span className="feature-stat-value">{value}</span>
              <span className="feature-stat-label">{label}</span>
            </div>
          ))}
        </div>
      </section>
      <SectionDoodle />

      <Problem />
      <SectionDoodle />
      <Understand />
      <SectionDoodle />
      <HowItWorks />
      <SectionDoodle />
      <ArchitectureViz />
      <SectionDoodle />
      <RiskImpact />
      <SectionDoodle />
      <AskCodebase />
      <SectionDoodle />
      <TechFoundation />
      <SectionDoodle />
      <FinalCTA />
      <Footer />

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </>
  );
}
