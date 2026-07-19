# Lovable Import Prompt

Use this when connecting Lovable to the GitHub repo. Paste the text below into Lovable's prompt box after importing/connecting the repository.

**Repo:** https://github.com/jamestown502502/gigworkerbaisinc

---

## Paste this into Lovable:

```
This is a complete, working Vite + vanilla JavaScript browser game (Gig Worker
Simulator) — a Canvas-based life-sim. It is fully built and tested; do NOT
rewrite, refactor, or convert it to React. Deploy it as-is.

Build command: npm run build
Output directory: dist
Framework: Vite (static site, no backend, no database, no environment
variables needed)

Just install dependencies, run the build, and deploy the dist/ output as a
static site. Do not modify any source files in src/. If the build fails,
report the exact error rather than changing game logic to "fix" it.
```

---

## Why this wording matters

- **"Do NOT rewrite"** — AI website builders often assume every project should become a React app. This one is intentionally plain Canvas/JS for performance; a rewrite would break the whole game.
- **"Do not modify src/"** — protects the tested game logic from being "helpfully" changed.
- **Explicit build command + output dir** — removes any guessing about how to build this specific project.

## If Lovable asks for settings instead of a prompt

| Setting | Value |
|---|---|
| Framework preset | Vite (or "Other" / "Static Site") |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Environment variables | none needed |

## After it deploys

1. Open the live Lovable URL and play through Day 1 → sleep, confirm no blank screen / console errors.
2. If images or fonts don't load, open `vite.config.js` in the repo, add `base: './'`, commit, push, and redeploy — this makes asset paths relative instead of absolute.
