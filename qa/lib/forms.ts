import type { Locator, Page, Response } from "@playwright/test"

/**
 * Many shadcn forms in this codebase render `<Label>` and `<Input>` as siblings
 * without `htmlFor`/`id`. Playwright's `getByLabel` cannot find those inputs.
 * Locate by walking from the label's exact text to the next input/textarea.
 *
 * Confirmed cases (as of Phase 2):
 * - components/package-wizard.tsx — every field in Step 1
 * - components/package-detail-view.tsx — package metadata card
 *
 * Confirmed exceptions (use `getByLabel` directly):
 * - components/add-supplier-dialog.tsx — labels ARE properly associated
 */
export function labeledInput(scope: Locator, labelText: string): Locator {
  const escaped = labelText.replace(/"/g, '\\"')
  return scope
    .locator(
      `xpath=.//label[normalize-space()="${escaped}"]/following-sibling::*[self::input or self::textarea][1]`,
    )
    .first()
}

export async function fillBuffered(locator: Locator, value: string): Promise<void> {
  await locator.fill(value)
  await locator.blur()
}

export async function fillNumericField(
  scope: Locator,
  label: string,
  value: number,
): Promise<void> {
  const input = labeledInput(scope, label)
  await input.click()
  await input.fill("")
  await input.fill(String(value))
  await input.blur()
}

/**
 * `page.waitForLoadState("networkidle")` is unreliable after a form save:
 * the request may complete before "idle" is established, or "idle" may be
 * reached transiently while the actual save is still pending. Always wait on
 * the specific API response that the save triggers.
 *
 * Example:
 *   await saveAndWaitFor(page, /\/api\/packages\//, "PATCH", () =>
 *     page.getByRole("button", { name: /^Save$/ }).click(),
 *   )
 */
export async function saveAndWaitFor(
  page: Page,
  urlPattern: RegExp,
  method: string,
  trigger: () => Promise<void>,
  options: { timeout?: number } = {},
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      urlPattern.test(response.url()) && response.request().method() === method,
    { timeout: options.timeout ?? 15_000 },
  )
  await trigger()
  return responsePromise
}
