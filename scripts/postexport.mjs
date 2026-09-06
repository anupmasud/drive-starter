// Post-processes the Expo web export (dist/) for GitHub Pages + PWA install.
// Run automatically by `npm run build:web`.
//
// Two things GitHub Pages needs that Expo does not do for you:
//   1. .nojekyll, or Pages silently refuses to serve the _expo/ folder
//      (Jekyll skips anything starting with an underscore).
//   2. Absolute asset paths rewritten to sit under /<repo>/, because Pages
//      serves a project site from a subdirectory rather than the domain root.
import fs from "node:fs";
import path from "node:path";

const BASE = "/drive-starter";
const dist = path.resolve("dist");
const assets = path.resolve("assets");

if (!fs.existsSync(dist)) {
  console.error("dist/ not found — run `expo export --platform web` first.");
  process.exit(1);
}

// 1. Let Pages serve _expo/.
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

// 2. Icon for home-screen install.
fs.copyFileSync(path.join(assets, "icon.png"), path.join(dist, "icon.png"));

// 3. Web app manifest, so it installs to a phone home screen like a real app.
const manifest = {
  name: "Drive Starter",
  short_name: "Drive Starter",
  description: "Your data, in a folder of your own Google Drive.",
  start_url: `${BASE}/`,
  scope: `${BASE}/`,
  display: "standalone",
  background_color: "#FBF7F0",
  theme_color: "#FBF7F0",
  icons: [
    { src: `${BASE}/icon.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `${BASE}/icon.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};
fs.writeFileSync(path.join(dist, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

// 4. Rewrite root-absolute URLs to the project subdirectory, and add the
//    manifest + Apple meta tags Expo does not emit.
const indexPath = path.join(dist, "index.html");
let html = fs.readFileSync(indexPath, "utf8");

html = html
  .replace(/(src|href)="\/(?!\/)/g, `$1="${BASE}/`)
  .replace(
    "</head>",
    `  <link rel="manifest" href="${BASE}/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="${BASE}/icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Drive Starter" />
</head>`
  );

fs.writeFileSync(indexPath, html);

// 5. Same rewrite inside the JS bundles, which reference /_expo/... at runtime.
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

let patched = 0;
for (const file of walk(dist)) {
  if (!file.endsWith(".js")) continue;
  const before = fs.readFileSync(file, "utf8");
  const after = before.replaceAll('"/_expo/', `"${BASE}/_expo/`);
  if (after !== before) { fs.writeFileSync(file, after); patched++; }
}

console.log(`postexport: base ${BASE}, ${patched} bundle(s) rewritten, manifest written.`);
