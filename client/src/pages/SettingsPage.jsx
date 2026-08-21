import { useState, useEffect } from "react";
import { Agentation } from "agentation";
import { User, ShieldCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { DashboardShell } from "../components/dashboard/DashboardShell";
import { Sidebar } from "../components/dashboard/Sidebar";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { IconBadge } from "../components/dashboard/IconBadge";
import { GeminiKeySection } from "../components/GeminiKeySection";
import "../pages/dashboard-page.css";
import "./settings-page.css";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    return <div className="dashboard-page dashboard-loading">Loading…</div>;
  }

  return (
    <div className="dashboard-page">
      <div className="grain" />
      <DashboardShell
        sidebar={<Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} page="settings" />}
        header={
          <DashboardHeader
            user={user}
            heading="Settings"
            subheading="Manage your account and integrations."
            onToggleSidebar={() => setMobileOpen((v) => !v)}
          />
        }
      >
        <div className="settings-grid">
          <div className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-head-title">
                <IconBadge icon={User} tone="accent" />
                <h2>Account</h2>
              </div>
            </div>
            <div className="settings-account-row">
              {user.avatarUrl ? (
                <img className="settings-account-avatar" src={user.avatarUrl} alt="" />
              ) : (
                <span className="settings-account-avatar settings-account-avatar-fallback">
                  {user.username[0]?.toUpperCase()}
                </span>
              )}
              <div>
                <p className="settings-account-name">{user.username}</p>
                <p className="settings-account-meta">
                  <ShieldCheck size={13} strokeWidth={2} />
                  Connected via GitHub
                </p>
              </div>
            </div>
          </div>

          <GeminiKeySection
            hasKey={Boolean(user.hasGeminiKey)}
            onChange={(hasKey) => setUser((u) => ({ ...u, hasGeminiKey: hasKey }))}
          />
        </div>
      </DashboardShell>

      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </div>
  );
}
