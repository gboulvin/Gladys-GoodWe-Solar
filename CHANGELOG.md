# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/gboulvin/Gladys-GoodWe-Solar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gboulvin/Gladys-GoodWe-Solar/releases/tag/v1.0.0
