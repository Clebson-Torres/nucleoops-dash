import { expect, test, type Page } from "@playwright/test";

const liveEnabled = process.env.E2E_LIVE_ENABLED === "1";

const supportEmail = process.env.E2E_LIVE_EMAIL ?? "";
const supportPassword = process.env.E2E_LIVE_PASSWORD ?? "";
const supportAgentId = process.env.E2E_LIVE_AGENT_ID ?? "";

const adminEmail = process.env.E2E_LIVE_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_LIVE_ADMIN_PASSWORD ?? "";
const adminAgentId = process.env.E2E_LIVE_ADMIN_AGENT_ID ?? supportAgentId;

const liveCommand = process.env.E2E_LIVE_COMMAND ?? "echo e2e-live";
const liveExecuteCommand =
  process.env.E2E_LIVE_EXECUTE_COMMAND ??
  "powershell -NoProfile -Command \"Write-Output 'e2e-download-and-execute'\"";

function hasSupportConfig(): boolean {
  return Boolean(liveEnabled && supportEmail && supportPassword && supportAgentId);
}

function hasAdminConfig(): boolean {
  return Boolean(liveEnabled && adminEmail && adminPassword && adminAgentId);
}

async function loginInTopbar(page: Page, email: string, password: string) {
  await page.goto("/overview");
  await page.getByPlaceholder("e-mail Supabase").fill(email);
  await page.getByPlaceholder("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/^Autenticado no backend:/)).toBeVisible({ timeout: 30_000 });
}

async function openJobs(page: Page) {
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: "Jobs", level: 1, exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

async function prepareTarget(page: Page, agentId: string) {
  const targetRow = page.locator(".target-item", { hasText: agentId }).first();
  await expect(targetRow).toBeVisible({ timeout: 30_000 });
  await targetRow.locator("input[type='checkbox']").check();
}

async function ensureArtifactSelected(page: Page) {
  const artifactSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Selecione artefato" }) })
    .first();
  await expect(artifactSelect).toBeVisible({ timeout: 15_000 });

  const optionCount = await artifactSelect.locator("option").count();
  if (optionCount < 2) {
    const uploadInput = page.locator("input[type='file']").first();
    await uploadInput.setInputFiles({
      name: `e2e-${Date.now()}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("e2e artifact", "utf-8"),
    });
    await expect.poll(async () => artifactSelect.locator("option").count()).toBeGreaterThan(1);
  }

  await artifactSelect.selectOption({ index: 1 });
  await expect.poll(async () => artifactSelect.inputValue()).not.toBe("");
}

async function createJobAndWaitRequest(page: Page, expectedStatus = 201) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/jobs") && response.request().method() === "POST",
    { timeout: 20_000 }
  );
  await page.getByRole("button", { name: "Criar job" }).click();
  const response = await responsePromise;
  const body = await response.text();
  expect(response.status(), `POST /jobs failed: ${body}`).toBe(expectedStatus);
}

async function waitExecutionFinalStatus(page: Page, jobName: string, agentId: string) {
  const jobRow = page.locator("tr", { hasText: jobName }).first();
  await expect(jobRow).toBeVisible({ timeout: 30_000 });
  await jobRow.getByRole("button", { name: "Ver execucoes" }).click();

  const executionRow = page.locator("tr", { hasText: agentId }).first();
  await expect(executionRow).toBeVisible({ timeout: 120_000 });

  await expect
    .poll(
      async () => {
        const status = (await executionRow.locator(".badge").first().textContent())?.trim().toLowerCase() ?? "";
        return status;
      },
      { timeout: 180_000, intervals: [2000, 4000, 5000] }
    )
    .toMatch(/success|failed|timeout/);
}

test.describe("dashboard live operations - support", () => {
  test.skip(
    !hasSupportConfig(),
    "Set E2E_LIVE_ENABLED=1 + E2E_LIVE_EMAIL + E2E_LIVE_PASSWORD + E2E_LIVE_AGENT_ID"
  );

  test("support can create run_command via allowlisted command", async ({ page }) => {
    test.setTimeout(240_000);
    await loginInTopbar(page, supportEmail, supportPassword);
    await openJobs(page);

    const jobName = `e2e-support-run-${Date.now()}`;
    await page.locator("label:has-text('Nome') input").fill(jobName);
    await page.locator("label:has-text('Acao') select").selectOption("run_command");

    const allowlist = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "Comando permitido" }) })
      .first();
    await allowlist.selectOption({ index: 1 });
    await expect.poll(async () => allowlist.inputValue()).not.toBe("");

    await prepareTarget(page, supportAgentId);
    await createJobAndWaitRequest(page, 201);
    await waitExecutionFinalStatus(page, jobName, supportAgentId);
  });

  test("support can create download_artifact job", async ({ page }) => {
    test.setTimeout(240_000);
    await loginInTopbar(page, supportEmail, supportPassword);
    await openJobs(page);

    const jobName = `e2e-support-artifact-${Date.now()}`;
    await page.locator("label:has-text('Nome') input").fill(jobName);
    await page.locator("label:has-text('Acao') select").selectOption("download_artifact");

    await ensureArtifactSelected(page);
    await prepareTarget(page, supportAgentId);
    await createJobAndWaitRequest(page, 201);
    await waitExecutionFinalStatus(page, jobName, supportAgentId);
  });
});

test.describe("dashboard live operations - admin", () => {
  test.skip(
    !hasAdminConfig(),
    "Set E2E_LIVE_ENABLED=1 + E2E_LIVE_ADMIN_EMAIL + E2E_LIVE_ADMIN_PASSWORD + E2E_LIVE_ADMIN_AGENT_ID"
  );

  test("admin can create run_command with direct command", async ({ page }) => {
    test.setTimeout(240_000);
    await loginInTopbar(page, adminEmail, adminPassword);
    await openJobs(page);

    const jobName = `e2e-admin-run-${Date.now()}`;
    await page.locator("label:has-text('Nome') input").fill(jobName);
    await page.locator("label:has-text('Acao') select").selectOption("run_command");
    await page.locator("textarea").fill(liveCommand);

    await prepareTarget(page, adminAgentId);
    await createJobAndWaitRequest(page, 201);
    await waitExecutionFinalStatus(page, jobName, adminAgentId);
  });

  test("admin can create download_artifact job", async ({ page }) => {
    test.setTimeout(240_000);
    await loginInTopbar(page, adminEmail, adminPassword);
    await openJobs(page);

    const jobName = `e2e-admin-artifact-${Date.now()}`;
    await page.locator("label:has-text('Nome') input").fill(jobName);
    await page.locator("label:has-text('Acao') select").selectOption("download_artifact");

    await ensureArtifactSelected(page);
    await prepareTarget(page, adminAgentId);
    await createJobAndWaitRequest(page, 201);
    await waitExecutionFinalStatus(page, jobName, adminAgentId);
  });

  test("admin can create download_and_execute job", async ({ page }) => {
    test.setTimeout(240_000);
    await loginInTopbar(page, adminEmail, adminPassword);
    await openJobs(page);

    const jobName = `e2e-admin-exec-${Date.now()}`;
    await page.locator("label:has-text('Nome') input").fill(jobName);
    await page.locator("label:has-text('Acao') select").selectOption("download_and_execute");
    await page.locator("textarea").fill(liveExecuteCommand);

    await ensureArtifactSelected(page);
    await prepareTarget(page, adminAgentId);
    await createJobAndWaitRequest(page, 201);
    await waitExecutionFinalStatus(page, jobName, adminAgentId);
  });
});
