import { useState } from "react";

const ROLE_LABEL = { entry: "Entry", service: "Service", store: "Store", default: "Other" };

function togglePill(active, all, value) {
  const current = active || new Set(all);
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  // Every option selected is equivalent to "no filter" — keep state minimal.
  return next.size === all.length ? null : next;
}

// Relationship filtering answers "where does X occur in my codebase?" —
// clicking one relationship should ISOLATE it (show only "queries" edges),
// not toggle it out of an all-active set. Click the same one again to
// restore "show everything".
function isolatePill(active, value) {
  if (active && active.size === 1 && active.has(value)) return null;
  return new Set([value]);
}

// Everything that would otherwise be a permanent row of pills lives here
// instead, behind a single gear icon — group colors, role/group/relationship
// filters. Advanced, not ambient.
export function GraphSettingsPopover({
  model, activeRoles, onRolesChange, activeGroups, onGroupsChange, activeRelLabels, onRelLabelsChange,
}) {
  const [open, setOpen] = useState(false);
  const roles = [...new Set(model.nodes.map((n) => n.role))];
  const groups = model.groupIds;
  const relLabels = model.relLabels;
  const groupColors = [...model.groupColor.entries()];

  return (
    <div className="graph-settings">
      <button
        type="button"
        className={`graph-icon-btn ${open ? "is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Graph settings"
        title="Graph settings"
      >
        ⚙
      </button>
      {open && (
        <div className="graph-settings-popover">
          {groupColors.length > 0 && (
            <div className="graph-settings-section">
              <h4>Groups</h4>
              <div className="graph-settings-chips">
                {groupColors.map(([id, color]) => (
                  <button
                    key={id}
                    type="button"
                    className={`graph-chip ${!activeGroups || activeGroups.has(id) ? "is-active" : ""}`}
                    style={{ "--chip-color": color.stroke }}
                    onClick={() => onGroupsChange(togglePill(activeGroups, groups, id))}
                  >
                    <span className="graph-chip-dot" />
                    {model.groupsById.get(id) || id}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="graph-settings-section">
            <h4>Role</h4>
            <div className="graph-settings-chips">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`graph-chip ${!activeRoles || activeRoles.has(r) ? "is-active" : ""}`}
                  onClick={() => onRolesChange(togglePill(activeRoles, roles, r))}
                >
                  {ROLE_LABEL[r] || r}
                </button>
              ))}
            </div>
          </div>

          {relLabels.length > 1 && (
            <div className="graph-settings-section">
              <h4>Relationship</h4>
              <p className="graph-settings-hint">Click one to isolate where it occurs.</p>
              <div className="graph-settings-chips">
                {relLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    className={`graph-chip graph-chip-truncate ${!activeRelLabels || activeRelLabels.has(label) ? "is-active" : ""}`}
                    onClick={() => onRelLabelsChange(isolatePill(activeRelLabels, label))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
