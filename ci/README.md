# CI workflow (pending activation)

`github-ci.yml` is the GitHub Actions workflow for this repo (unit → build → Playwright on
Chromium, Firefox, Android Chrome, iPhone WebKit). It lives here instead of
`.github/workflows/` only because the stored GitHub credential lacks the `workflow` OAuth
scope, which GitHub requires to push workflow files.

To activate it once:

```bash
gh auth refresh -h github.com -s workflow
git mv ci/github-ci.yml .github/workflows/ci.yml
git commit -m "Activate CI workflow" && git push
```
