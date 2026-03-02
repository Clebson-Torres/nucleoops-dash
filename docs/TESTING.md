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

## E2E live operations (agents installed)
Use this for real click simulation + command execution against installed agents.

Required env vars:
- `E2E_LIVE_ENABLED=1`
- `E2E_LIVE_EMAIL=<supabase_admin_email>`
- `E2E_LIVE_PASSWORD=<supabase_admin_password>`
- `E2E_LIVE_AGENT_ID=<agent_id_from_agents_page>`
- Optional: `E2E_LIVE_COMMAND=<command>` (default: `echo e2e-live`)

Run:
```powershell
$env:E2E_LIVE_ENABLED="1"
$env:E2E_LIVE_EMAIL="admin@empresa.com"
$env:E2E_LIVE_PASSWORD="senha"
$env:E2E_LIVE_AGENT_ID="nitrov15-windows"
$env:E2E_LIVE_COMMAND="echo live-test"
npm run test:e2e:live
```

Scenario:
1. Login in topbar
2. Navigate to `/jobs`
3. Create `run_command` job
4. Select real target agent
5. Open `Ver execucoes`
6. Wait until final status (`success|failed|timeout`)
