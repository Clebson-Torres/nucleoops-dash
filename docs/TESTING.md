# Dashboard Testing Guide

## Scope
- TypeScript build validation
- E2E smoke flows with Playwright

## Local run
```powershell
.\scripts\test-dashboard.ps1
```

## Manual run
```powershell
npm ci
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

## Artifacts
- `.\test-results\dashboard-<timestamp>\summary.json`
- Step logs:
  - `npm-ci.log`
  - `build.log`
  - `playwright-install.log`
  - `e2e.log`
- Playwright report/traces:
  - `.\playwright-report\`
  - `.\test-results\e2e-artifacts\`

## E2E smoke scenarios
- Shell render on `/overview`
- Topbar login controls visible when session is absent
- `/deploy` restricted message for non-admin
- `/auth` password form render
