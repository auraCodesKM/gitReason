const GITHUB_API = "https://api.github.com";
const REPO_PATH_RE = /^[\w.-]+\/[\w.-]+$/;

export function parseRepoPath(input) {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  const withoutHost = trimmed.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  const path = withoutHost.replace(/^\/+|\/+$|\.git$/g, "");

  if (!REPO_PATH_RE.test(path)) return null;

  const [owner, repo] = path.split("/");
  return { owner, repo, fullName: `${owner}/${repo}` };
}

function authHeaders(token, extra = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "gitreason-app",
    ...extra,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    // Unauthenticated public-repo checks are capped at 60 req/hr per IP.
    // The OAuth app's own credentials raise that to 5000/hr (still just
    // reading public data — no user token involved).
    const basic = Buffer.from(
      `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  return headers;
}

export async function fetchRepo(owner, repo, token) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: authHeaders(token) });

  if (res.status === 200) {
    const data = await res.json();
    return {
      found: true,
      repo: {
        fullName: data.full_name,
        description: data.description,
        private: data.private,
        defaultBranch: data.default_branch,
        stars: data.stargazers_count,
        language: data.language,
      },
    };
  }

  if (res.status === 404) return { found: false };

  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("rate_limited");
  }

  throw new Error(`GitHub API error: ${res.status}`);
}

export async function fetchTree(owner, repo, branch, token) {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: authHeaders(token) }
  );

  if (res.status === 404) return { tree: [], truncated: false };
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const data = await res.json();
  return {
    tree: (data.tree || [])
      .filter((e) => e.type === "blob" || e.type === "tree")
      .map((e) => ({ path: e.path, type: e.type === "tree" ? "dir" : "file", size: e.size || 0 })),
    truncated: Boolean(data.truncated),
  };
}

export async function fetchReadme(owner, repo, token) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, {
    headers: authHeaders(token, { Accept: "application/vnd.github.raw+json" }),
  });

  if (!res.ok) return null;
  return res.text();
}

export async function fetchFileContent(owner, repo, filePath, ref, token) {
  if (!token) {
    // Public repos: raw.githubusercontent.com costs nothing against the API rate limit.
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${filePath}`
    );
    if (!res.ok) return null;
    return res.text();
  }

  // Private repos need the authenticated contents API.
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
    { headers: authHeaders(token, { Accept: "application/vnd.github.raw+json" }) }
  );
  if (!res.ok) return null;
  return res.text();
}

// The dashboard's GitHub activity heatmap: GitHub's own contribution
// calendar, via the GraphQL API (the REST API has no equivalent endpoint).
// Works with a plain "repo"-scope OAuth token — no extra scope needed,
// since this only reads the authenticated user's own public calendar data.
export async function fetchContributionCalendar(username, token) {
  const now = new Date();
  const from = new Date(now.getTime() - 371 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount weekday } }
        }
      }
    }
  }`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "gitreason-app",
    },
    body: JSON.stringify({ query, variables: { login: username, from, to } }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const calendar = data?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) return null;

  return {
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks.map((w) => ({
      days: w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
    })),
  };
}

// Bytes-per-language for one repo, straight from GitHub's own detector —
// used for the dashboard's codebase composition chart.
export async function fetchRepoLanguages(owner, repo, token) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`, { headers: authHeaders(token) });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchGitHubUser(token) {
  const res = await fetch(`${GITHUB_API}/user`, { headers: authHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return { githubId: data.id, username: data.login, avatarUrl: data.avatar_url };
}

export async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri }) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (data.error || !data.access_token) return null;

  return data.access_token;
}
