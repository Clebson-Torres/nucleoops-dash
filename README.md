# NucleoOps Dashboard

Frontend React/TypeScript for daily operations in NucleoOps (overview, jobs, agents, deploy, settings).

## Development

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

## E2E smoke tests

```powershell
npx playwright install chromium
npm run test:e2e
```

## Unified local test script

```powershell
.\scripts\test-dashboard.ps1
```

## Environment variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Docs
- [Testing guide](docs/TESTING.md)
- [Test roadmap](docs/TEST_ROADMAP.md)

