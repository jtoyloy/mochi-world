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

Layout cases use DPR 1; only the preference test uses DPR 2 to verify the live
backing-density change. Overflow failures report the violating dimension plus
document, world shell and viewport dimensions, preserving the document width,
document height and world shell width checks.

Hosted run 64 passed the preference test and failed four layout cases; the two
remaining cases did not complete. All four compact layouts completed their
initial hit checks and disclosure actions. After resize to 1920×1080 at DPR 2,
traces showed slow frame delivery and trial-click waits (median waits increased
from 289–417 ms to 945–1654 ms in three cases); the 768×1024 case instead failed
the original boolean overflow predicate without identifying the dimension.
These findings motivated DPR 1 for layout checks and richer overflow diagnostics.
The checks, seven cases, time limits and zero retries remain unchanged. This
harness refinement does not establish that the unexplained overflow is fixed;
it requires another hosted run before any application change is justified.

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

Hosted run 66 at `7a88cdd7ebc88232903d77184de410ed8eb2f03c` passed all seven
cases in 2.4 minutes. A subsequent expiry regression at
`4d76a1dc88e84a370942cc73a6fff48885288407` deliberately exposed a real application
defect: run 68 passed six cases and failed only the 1280×720 case because
`#toast` retained “Choose a companion first.” after its class was cleared.
The unchanged ten-second assertion observed both styled and unstyled retained
text. Artifact 11859469033 preserves the failure (ZIP SHA256
`5ad620a2a3289503febeb0f164cf832124b38308e26fc52ad1bda0aa1bd44037`).
The correction clears text in the same five-second callback; independent source
review approved it. Its exact-source hosted verification remains pending.
