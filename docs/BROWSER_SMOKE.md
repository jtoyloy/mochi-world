# Hosted functional browser smoke

After the existing build, JavaScript/Python tests, audit and diff checks, the
GitHub Actions test job installs Chromium with
`npx playwright install --with-deps chromium`, then runs `npx playwright test`.
It reuses the job's disposable PostgreSQL 16 test database and native Python
environment. The configuration requires `TEST_DATABASE_URL` using the `postgres`
or `postgresql` protocol and pointing to a loopback database whose decoded name
contains an explicit `test` segment separated by underscores or hyphens (for
example `mochi_test`); it never falls back to `DATABASE_URL` or loads
`.env`. Playwright starts its own server on `127.0.0.1:8789`, refuses an existing
server, requires authentication, enables mock currency and market data, limits
native battle workers to one, and stores checkpoints in a process-specific temp
directory. No production credentials or external service are needed.

The seven tests run serially in Chromium with no retries, a 45-second per-test
timeout and a five-minute suite limit. Browser installation has a five-minute
timeout; the whole hosted job is limited to fifteen minutes. Each fresh browser context registers a
synthetic account through the visible form, waits for the authenticated `/home`
world, its live socket and canvas, and uses real application requests. Tests do
not grant inventory through APIs, patch application state, or seed local storage.

Coverage includes:

- Settings → Sound, motion & graphics, closing the nested dialog and returning
  keyboard focus to each invoker.
- Standard → Low power → Standard, checking the visible density/FPS status,
  actual canvas backing dimensions and unchanged logical viewport at DPR 2,
  with Low power restored across a real page reload.
- Decorative motion toggle and its remembered `aria-pressed` state after reload.
- A positive volume set with slider keys, mute, reload, remembered mute, and
  unmute restoring the preceding positive volume through visible controls.
- Viewports 320×740, 390×844, 768×1024, 844×390, 1280×720 and 1920×1080: document
  overflow, visible world control bounds, center-point hit testing and Playwright
  actionability, compact emote/phrase and camera actions, focus return, and
  restoring the camera/map to the world when resized with its dialog open.

Chromium uses SwiftShader for the hosted runner. This is a functional UI gate,
not physical-device, WAN, performance, accessibility-conformance, or candidate
certification. It does not establish rendering speed or actual sound output.

Failures retain a screenshot, Playwright trace and HTML report as the
`browser-smoke-failure` GitHub artifact for three days. Reports contain synthetic
test credentials and session data; they must not use real accounts. Browser
outputs are ignored by Git and browser specs are outside `npm test` globs.
Local execution also needs installed dependencies, a built client, the native
environment and a migrated disposable test database. Do not install browsers or
run this suite locally while the workspace is below its disk headroom floor.

The setup follows the official [Playwright CI guide](https://playwright.dev/docs/ci-intro)
and [web server configuration](https://playwright.dev/docs/test-webserver).
