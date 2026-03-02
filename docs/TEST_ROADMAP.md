# Frontend Test Roadmap

## Current cycle
- CI checks:
  - `npm ci`
  - `npm run build`
  - `npm run test:e2e` (Playwright smoke)

## Next cycle targets
1. Expand E2E from smoke to authenticated flows (login, create job, inspect execution logs).
2. API contract tests for auth and RBAC errors.
3. Component tests for critical forms (jobs, auth, users).
4. Visual regression for core dashboard pages.
