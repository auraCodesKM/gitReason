import { useEffect, useState } from "react";
import { Agentation } from "agentation";
import { LogoMark } from "../sections/LogoMark";
import { apiFetch } from "../lib/api";
import { GeminiKeySection } from "../components/GeminiKeySection";
import "./settings-page.css";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          window.location.href = "/sign";
          return;
        }
        setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !user) {
    return <div className="settings-page settings-loading">Loading…</div>;
  }

  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <a href="/" className="settings-logo" aria-label="GitReason">
          <LogoMark />
          GitReason
        </a>
        <a href="/dashboard" className="settings-back">← Dashboard</a>
      </header>

      <div className="settings-content">
        <h1 className="settings-title">Settings</h1>

        <section>
          <h2 className="settings-section-title">AI provider</h2>
          <GeminiKeySection
            hasKey={Boolean(user.hasGeminiKey)}
            onChange={(hasKey) => setUser((u) => ({ ...u, hasGeminiKey: hasKey }))}
          />
        </section>
      </div>

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
