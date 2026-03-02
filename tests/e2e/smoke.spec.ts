import { test, expect } from "@playwright/test";

test.describe("dashboard smoke", () => {
  test("overview shell renders", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByText("NucleoOps")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("topbar shows login controls when session is absent", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Esqueci a senha" })).toBeVisible();
  });

  test("deploy page is restricted for non-admin session", async ({ page }) => {
    await page.goto("/deploy");
    await expect(page.getByText("Somente admin pode executar deploy de agent.")).toBeVisible();
  });

  test("auth page renders password update form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByText("Definir nova senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Atualizar senha" })).toBeVisible();
  });
});
