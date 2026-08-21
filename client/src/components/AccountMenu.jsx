import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import "./account-menu.css";

export function AccountMenu({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function signOut() {
    apiFetch("/api/auth/logout", { method: "POST" }).then(() => {
      window.location.href = "/";
    });
  }

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-menu-trigger" onClick={() => setOpen((v) => !v)} aria-label="Account menu">
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="account-menu-fallback">{user.username[0]?.toUpperCase()}</span>}
      </button>

      {open && (
        <div className="account-menu-dropdown">
          <div className="account-menu-identity">
            <span className="account-menu-name">{user.username}</span>
            <span className="account-menu-handle">@{user.username}</span>
          </div>
          <div className="account-menu-separator" />
          <span className="account-menu-item account-menu-item-disabled" title="Coming soon">Account</span>
          <a href="/settings" className="account-menu-item">Settings</a>
          <div className="account-menu-separator" />
          <button type="button" className="account-menu-item account-menu-item-destructive" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
