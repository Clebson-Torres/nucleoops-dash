import { expect, test } from "@playwright/test";

const liveEnabled = process.env.E2E_LIVE_ENABLED === "1";
const liveEmail = process.env.E2E_LIVE_EMAIL ?? "";
const livePassword = process.env.E2E_LIVE_PASSWORD ?? "";
const liveAgentId = process.env.E2E_LIVE_AGENT_ID ?? "";
const liveCommand = process.env.E2E_LIVE_COMMAND ?? "echo e2e-live";

function hasLiveConfig(): boolean {
  return Boolean(liveEnabled && liveEmail && livePassword && liveAgentId);
}

async function loginInTopbar(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/overview");
  await page.getByPlaceholder("e-mail Supabase").fill(liveEmail);
  await page.getByPlaceholder("senha").fill(livePassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Autenticado no backend")).toBeVisible({ timeout: 30_000 });
}

test.describe("dashboard live operations", () => {
  test.skip(!hasLiveConfig(), "Set E2E_LIVE_ENABLED=1 + E2E_LIVE_EMAIL + E2E_LIVE_PASSWORD + E2E_LIVE_AGENT_ID");

  test("create run_command job and verify execution reaches final status", async ({ page }) => {
    test.setTimeout(240_000);
    await loginInTopbar(page);
    await page.goto("/jobs");

    const jobName = `e2e-live-${Date.now()}`;
    await page.locator("label:has-text('Nome') input").fill(jobName);
    await page.locator("label:has-text('Acao') select").selectOption("run_command");
    await page.locator("textarea").fill(liveCommand);

    const targetRow = page.locator(".target-item", { hasText: liveAgentId }).first();
    await expect(targetRow).toBeVisible({ timeout: 30_000 });
    await targetRow.locator("input[type='checkbox']").check();

    await page.getByRole("button", { name: "Criar job" }).click();

    const jobRow = page.locator("tr", { hasText: jobName }).first();
    await expect(jobRow).toBeVisible({ timeout: 30_000 });
    await jobRow.getByRole("button", { name: "Ver execucoes" }).click();

    const executionRow = page.locator("tr", { hasText: liveAgentId }).first();
    await expect(executionRow).toBeVisible({ timeout: 120_000 });

    await expect
      .poll(
        async () => {
          const status = (await executionRow.locator(".badge").first().textContent())?.trim().toLowerCase() ?? "";
          return status;
        },
        {
          timeout: 180_000,
          intervals: [2000, 4000, 5000],
        }
      )
      .toMatch(/success|failed|timeout/);
  });
});
