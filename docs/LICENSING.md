# Attribution and license boundaries
Original Mochi: https://github.com/muellerberndt/mochi, commit
39dbb4c675d65316e9323bc1c1648b1810658590. Original LICENSE retained unchanged (MIT),
along with existing documentation, author attribution and the original brain pack.
Brain viewer/atlas originate in Cadence examples (MIT), as described upstream.

The bundled cadence-net 0.74.0 wheel declares GPLv3 and includes its license.
The new pack includes the identical unmodified wheel, preserves its GPL files and
makes the modified host sources available in pack py/ and the repository. Cadence
source: https://github.com/muellerberndt/cadence. Review corresponding-source delivery
and combined-work obligations before redistribution; the root MIT license does not
relicense Cadence. This fork does not claim that all combinations are MIT licensed.

Dependency manifest/lock retains Pyodide (MPL-2.0), NumPy (BSD), node-postgres (MIT),
Drizzle ORM (Apache-2.0); their distribution license notices must travel with their
packages. Python test-only pytest is MIT. No wheel was repackaged or modified.
The optional Google-hosted font files are OFL-licensed (DM Sans/Fraunces); system fonts
remain a fallback. Live data is subject to CoinGecko's usage terms/rate limits.
