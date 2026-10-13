import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const cameraDialog = page => page.locator("dialog.world-camera-dialog[open]");
const worldCanvas = page => page.locator("#r3f-world > canvas:not(.iso-minimap)");

async function ready(page) {
  await expect(page.locator(".socket-status")).toHaveText("Online");
  await expect(page.locator(".room-label")).toContainText("Town Square");
  await expect(worldCanvas(page)).toBeVisible();
  await expect.poll(() => worldCanvas(page).evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
  // Wait for the fresh account's real guidance text before measuring wrapping.
  await expect(page.locator(".adventure-guidance")).toContainText("Next:");
}

async function register(page) {
  await page.goto("/home");
  await page.getByRole("button", { name: "New here? Create an account", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(`smoke_${randomUUID().replaceAll("-", "").slice(0, 16)}`);
  await page.getByLabel("Password", { exact: true }).fill(`Smoke-${randomUUID()}`);
  const registration = page.waitForResponse(response => response.url().endsWith("/api/auth/register") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await registration).status()).toBe(201);
  await ready(page);
}

async function openPreferences(page) {
  await page.getByRole("button", { name: "⚙ Settings", exact: true }).click();
  const settings = page.locator("dialog[open]").filter({ has: page.getByRole("heading", { name: "Your adventurer", exact: true }) });
  await expect(settings).toBeVisible();
  const invoker = settings.getByRole("button", { name: "Sound, motion & graphics", exact: true });
  await invoker.click();
  await expect(cameraDialog(page)).toBeVisible();
  await expect(invoker).toHaveAttribute("aria-expanded", "true");
  return { settings, invoker };
}

async function canvasSize(page) {
  return worldCanvas(page).evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, backingWidth: canvas.width, backingHeight: canvas.height };
  });
}

async function density(page, value) {
  await expect.poll(async () => {
    const size = await canvasSize(page);
    return Math.abs(size.backingWidth - size.width * value) <= 2
      && Math.abs(size.backingHeight - size.height * value) <= 2;
  }).toBe(true);
}

test.describe("high-density preferences", () => {
  test.use({ deviceScaleFactor: 2 });

  test("authenticated preferences restore focus, density, motion and remembered sound", async ({ page }) => {
    await register(page);
    const { settings, invoker } = await openPreferences(page);
    const controls = cameraDialog(page);
    const quality = controls.getByLabel("Graphics quality", { exact: true });
    await expect(quality).toHaveValue("standard");
    await expect(controls.getByRole("status").filter({ hasText: /^Standard · 2× pixel density · display refresh/ })).toBeVisible();
    await density(page, 2);
    const standard = await canvasSize(page);
    await quality.selectOption("low");
    await expect(controls.getByRole("status").filter({ hasText: /^Low power · 1× pixel density · 30 FPS cap/ })).toBeVisible();
    await density(page, 1);
    const low = await canvasSize(page);
    expect(low.width).toBe(standard.width);
    expect(low.height).toBe(standard.height);
    expect(low.backingWidth).toBeLessThan(standard.backingWidth);
    const motion = controls.getByRole("button", { name: "Reduce decorative motion", exact: true });
    const originalMotion = await motion.getAttribute("aria-pressed");
    expect(originalMotion).toMatch(/^(true|false)$/);
    const rememberedMotion = String(originalMotion !== "true");
    await motion.click();
    await expect(motion).toHaveAttribute("aria-pressed", rememberedMotion);

    const volume = controls.getByRole("slider", { name: "Sound volume", exact: true });
    await volume.focus();
    await volume.press("Home");
    await volume.press("ArrowRight");
    await volume.press("ArrowRight");
    const rememberedVolume = Number(await volume.inputValue());
    expect(rememberedVolume).toBeGreaterThan(0);
    await controls.getByRole("button", { name: "Mute sound", exact: true }).click();
    await expect(volume).toHaveValue("0");
    await page.reload();
    await ready(page);
    await openPreferences(page);
    await expect(quality).toHaveValue("low");
    await expect(controls.getByRole("status").filter({ hasText: /^Low power · 1× pixel density · 30 FPS cap/ })).toBeVisible();
    await density(page, 1);
    expect(await canvasSize(page)).toEqual(low);
    await expect(motion).toHaveAttribute("aria-pressed", rememberedMotion);
    await quality.selectOption("standard");
    await expect(controls.getByRole("status").filter({ hasText: /^Standard · 2× pixel density · display refresh/ })).toBeVisible();
    await density(page, 2);
    expect(await canvasSize(page)).toEqual(standard);
    await expect(volume).toHaveValue("0");
    const unmute = controls.getByRole("button", { name: "Unmute sound", exact: true });
    await expect(unmute).toHaveAttribute("aria-pressed", "true");
    await unmute.click();
    expect(Number(await volume.inputValue())).toBe(rememberedVolume);
    await expect(controls.getByRole("button", { name: "Mute sound", exact: true })).toHaveAttribute("aria-pressed", "false");

    await controls.getByRole("button", { name: "Close", exact: true }).click();
    await expect(invoker).toBeFocused();
    await expect(invoker).toHaveAttribute("aria-expanded", "false");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "⚙ Settings", exact: true })).toBeFocused();
  });
});

// Read only the public DOM; all state changes above and below use normal UI.
async function worldTargets(page) {
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector(".social-world");
    const dimensions = {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: root.scrollWidth, height: root.scrollHeight },
      shell: { width: shell.clientWidth, height: shell.clientHeight,
        scrollWidth: shell.scrollWidth, scrollHeight: shell.scrollHeight },
    };
    return [
      ["document width", root.scrollWidth, innerWidth + 1],
      ["document height", root.scrollHeight, innerHeight + 1],
      ["shell width", shell.scrollWidth, shell.clientWidth + 1],
    ].filter(([, actual, maximum]) => actual > maximum)
      .map(([dimension, actual, maximum]) => ({ dimension, actual, maximum, ...dimensions }));
  })).toEqual([]);
  const targets = page.locator(".world-topbar button, .world-dock button, .adventure-hud button, .world-emotes button, .world-emotes select, .world-camera-disclosure, .iso-controls button, .iso-controls input, .iso-controls select");
  let visible = 0;
  for (const target of await targets.all()) {
    if (!await target.isVisible()) continue;
    visible++;
    const reachable = await target.evaluate(element => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1
        && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
        && !!hit && (hit === element || element.contains(hit));
    });
    expect(reachable, `visible target must be in viewport and receive a center hit: ${await target.getAttribute("aria-label") || await target.textContent()}`).toBe(true);
    await target.click({ trial: true });
  }
  expect(visible).toBeGreaterThan(8);
}

for (const [width, height, compact] of [
  [320, 740, true], [390, 844, true], [768, 1024, true], [844, 390, true],
  [1280, 720, false], [1920, 1080, false],
]) {
  test(`world controls at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await register(page);
    const shell = page.locator(".social-world");
    if (compact) await expect(shell).toHaveClass(/compact-overlays/);
    else await expect(shell).not.toHaveClass(/compact-overlays/);
    await worldTargets(page);
    if (!compact) {
      await expect(page.getByRole("button", { name: "Camera & map", exact: true })).toBeHidden();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      await page.getByRole("button", { name: "wave emote", exact: true }).click();
      return;
    }
    const emotes = page.getByRole("button", { name: "Emotes & phrases", exact: true });
    await emotes.click();
    await expect(emotes).toHaveAttribute("aria-expanded", "true");
    const emoteDialog = page.locator("dialog.world-emote-dialog[open]");
    await emoteDialog.getByRole("button", { name: "wave emote", exact: true }).click();
    await emoteDialog.getByLabel("Predefined public phrase", { exact: true }).selectOption("Hello!");
    await emoteDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(emotes).toBeFocused();
    await expect(emotes).toHaveAttribute("aria-expanded", "false");
    const camera = page.getByRole("button", { name: "Camera & map", exact: true });
    await camera.click();
    await expect(camera).toHaveAttribute("aria-expanded", "true");
    await cameraDialog(page).getByRole("button", { name: "Zoom in", exact: true }).click();
    await cameraDialog(page).getByRole("button", { name: "Recenter on your character", exact: true }).click();
    await cameraDialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await expect(camera).toBeFocused();
    await expect(camera).toHaveAttribute("aria-expanded", "false");
    await camera.click();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(cameraDialog(page)).toHaveCount(0);
    await expect(shell).not.toHaveClass(/compact-overlays/);
    await expect(shell.locator(".iso-controls")).toBeVisible();
    await expect(shell.locator(".iso-minimap")).toBeVisible();
    await worldTargets(page);
  });
}
