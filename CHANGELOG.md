# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- Requires Gladys 5.3.0 or later: the manifest declares search keywords for
  the new catalog of Gladys 5.3.
- Integration SDK 0.16.

## [1.0.2] - 2026-10-23

## [1.0.1] - 2026-10-22

### Security

- `brace-expansion`, pulled in by ESLint, raised to 5.0.12 against the
  high-severity denial-of-service advisories (GHSA-mh99-v99m-4gvg and
  related). A development tool only: the published image never shipped it.
- The image is rebuilt on the latest `node:24-alpine` (Node.js and Alpine
  security patches); development tools and CI actions up to date.

## [1.0.0] - 2026-10-14

### Added

- GoodWe inverters in Gladys, one device per inverter: solar production, daily
  and total production, grid power and indexes, house consumption, battery
  level, charge and discharge, inverter temperature and grid voltage.
- Local connection (UDP port 8899) for the ET/EH/BT/BH, DT/MS/D-NS/XS and
  ES/EM/BP families, with the network scan of the Gladys core and manual IP
  addresses.
- SEMS cloud connection (read-only), on its own or as a fallback of the local
  connection, with the cloud/local badge of each inverter.
- Scene triggers: solar production started and stopped, solar surplus started
  and ended, inverter fault, inverter unreachable and back online.
- Scene actions: read the inverter, set the operation mode, limit the grid
  export, set the battery depth of discharge.
- Dashboard widgets: inverter overview and production chart with the energy
  balance of the day.
- "Test the connection" button in the configuration.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-GoodWe-Solar/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/gboulvin/Gladys-GoodWe-Solar/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/gboulvin/Gladys-GoodWe-Solar/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/gboulvin/Gladys-GoodWe-Solar/releases/tag/v1.0.0
