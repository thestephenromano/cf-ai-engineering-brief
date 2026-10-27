import { test, expect } from "@playwright/test";

test("a conversation becomes an explicitly accepted plan and survives reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Untangle a problem" }),
  ).toBeEnabled();
  await page.screenshot({
    path: `test-results/empty-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Untangle a problem" }).click();
  await expect(page.getByRole("textbox", { name: "Your message" })).toHaveValue(
    /webhook consumer/,
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "Define the webhook contract" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept step" })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Accept step" }).first().click();
  await page.getByRole("button", { name: /Your plan/ }).click();
  await expect(
    page.getByRole("heading", { name: "Define the webhook contract" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make event handling idempotent" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText("Completed ✓")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Our webhook consumer sometimes processes events twice.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Your plan/ }).click();
  await expect(page.getByText("Completed ✓")).toBeVisible();
  await page.screenshot({
    path: `test-results/plan-${test.info().project.name}.png`,
    fullPage: true,
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export brief" }).click();
  expect((await downloaded).suggestedFilename()).toBe("engineering-brief.md");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New brief" }).click();
  await expect(
    page.getByRole("heading", { name: "What are you working on?" }),
  ).toBeVisible();
});

test("network errors retain the draft and retry the same request ID", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Untangle a problem" }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("A reliable webhook service");
  const ids: string[] = [];
  await page.route("**/api/chat", async (route) => {
    ids.push(route.request().postDataJSON().id as string);
    if (ids.length === 1) await route.abort();
    else await route.continue();
  });
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your message" })).toHaveValue(
    "A reliable webhook service",
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "Define the webhook contract" }),
  ).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
