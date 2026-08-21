const NOISE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "vendor", "target", "coverage", ".venv", "venv", "__pycache__",
  ".turbo", ".cache",
]);

const NOISE_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
  "Cargo.lock", "composer.lock", "Gemfile.lock", "poetry.lock", "uv.lock",
  ".DS_Store",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".bmp", ".tiff",
  ".mp4", ".mov", ".avi", ".webm", ".mp3", ".wav", ".flac",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".tar", ".gz", ".7z", ".rar",
  ".pdf", ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm",
  ".class", ".jar", ".pyc",
]);

export function filterTree(tree) {
  return tree.filter((entry) => {
    const parts = entry.path.split("/");
    if (parts.some((p) => NOISE_DIRS.has(p))) return false;

    const base = parts[parts.length - 1];
    if (NOISE_FILES.has(base)) return false;

    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
    if (BINARY_EXTENSIONS.has(ext)) return false;

    return true;
  });
}
