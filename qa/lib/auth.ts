import { expect, type Page } from "@playwright/test"

export const ADMIN_STORAGE_STATE = "qa/.auth/admin.json"

export async function login(page: Page): Promise<void> {
  await page.goto("/login")
  const quickLogin = page.getByRole("button", { name: /quick login/i })

  if (await quickLogin.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await quickLogin.click()
  } else {
    await page.getByLabel("Email").fill("carmen@luxustravel.co.za")
    await page.getByLabel("Password").fill("password123")
    await page.getByRole("button", { name: /sign in with email/i }).click()
  }

  await expect(page).toHaveURL(/\/app(?:\/)?$/)
}
