# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **GoodWe** external integration for Gladys Assistant: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

It reads GoodWe solar inverters two ways:

- **local**: UDP port 8899 of the inverter's WiFi/LAN dongle, Modbus RTU over
  UDP (ET and DT families) or the older AA55 protocol (ES family). Ported from
  the Python [`goodwe`](https://github.com/marcelblijleven/goodwe) library
  (MIT): when in doubt about a register, a scale or a sign, that library is the
  reference;
- **cloud**: the SEMS+ web API (unofficial, read-only), see
  `src/sems/client.js`.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/inverter.test.js         # one file
node --test --test-name-pattern "ET"      # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                     SDK bootstrap only
src/app.js                   SDK wiring: every handler, registered before connect()
src/service.js               inventory (by serial), local/cloud routing, transports, events
src/goodwe/protocol.js       frames, CRC, validators, payload readers (pure, no I/O)
src/goodwe/udpClient.js      UDP request/response, retries, one request at a time per host
src/goodwe/inverter.js       probe, read (normalized reading), settings, per family
src/goodwe/models.js         family / single-phase from the serial number
src/sems/client.js           SEMS+ client, injectable fetch
src/devices/inverter.js      Gladys device + features, reading -> states
src/events.js                scene trigger transitions (hysteresis, no event on start)
src/scenes.js                scene actions (manifest `scene_actions`)
src/widgets.js               dashboard widgets (manifest `widgets`)
src/i18n.js                  every user-facing text, en/fr/de/es
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys (en + fr mandatory)
test/                        node --test; fake inverter = real UDP server on 127.0.0.1
                             answering frames captured on real inverters (test/fixtures)
```

## Rules

- **External ids are forever.** A device is `gladys.externalIds('inverter',
<serial number>)`: the serial is the only id shared by the LAN and the cloud
  and stable across DHCP changes. Feature keys (`pv-power`, `grid-power`...)
  are stored by Gladys: never rename one. The same goes for every key users
  store: manifest `config_schema`, `actions`, widget, scene trigger and action
  keys, select option values.
- **Normalized reading.** Every family maps to the same reading
  (`src/goodwe/inverter.js` header): W, kWh, %, °C; `grid_power` > 0 when
  importing, `battery_power` > 0 when discharging. A value the inverter does
  not report is `null`, never 0. New values: add them to the reading of every
  family that has them, to `EMPTY_READING` in `src/service.js`, then to
  `FEATURES` in `src/devices/inverter.js`.
- **Test against captured frames.** A register change is tested with a real
  answer (`test/fixtures/*.hex`) and the value the `goodwe` library decodes
  from it. Tests never touch the network: the fake inverter listens on
  127.0.0.1, the SEMS client gets a fake `fetch`.
- **Be gentle with the hardware and the portal.** One UDP request at a time per
  inverter (the dongles mix concurrent answers up); the cloud is read at most
  every 5 minutes and backs off 5 minutes on a rate limit. Writes only through
  the scene actions, local only, and only the registers the `goodwe` library
  writes.
- **The container rootfs is read-only.** Write only under `/data` (the
  inventory, `/data/inventory.json`). Never log the SEMS password or token.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Four languages.** Every user-facing text exists in English, French, German
  and Spanish: manifest texts (`{ "en", "fr", "de", "es" }`), messages in
  `src/i18n.js`, and `docs/*.md`, kept in sync. `test/manifest.test.js` and
  `test/config.test.js` check the manifest and the messages.
- **Manifest.** The catalog `description` holds 10 to 100 characters per
  language. `widgets`, `scene_triggers`, `scene_actions` need
  `gladys_version >= 5.1.0`. `test/manifest.test.js` ties the manifest to the
  code (defaults, handlers, triggers, select options, outputs): change both
  sides together.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English.
