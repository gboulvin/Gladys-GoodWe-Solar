# GoodWe integration

Follow your GoodWe solar installation in Gladys: solar production, house
consumption, grid import/export and battery, live, with scenes and dashboard
widgets.

## Supported inverters

| Family               | Models                                     | Local (LAN)   | SEMS cloud |
| -------------------- | ------------------------------------------ | ------------- | ---------- |
| ET (hybrid, battery) | ET, EH, BT, BH, ET Plus, EHA/ESA G20, GEH… | ✅ + settings | ✅         |
| ES (hybrid, battery) | ES, EM, BP, SBP                            | ✅ + settings | ✅         |
| DT (grid-tied)       | DT, SDT, MT, MS, D-NS, XS, GEP…            | ✅            | ✅         |

The inverter needs its GoodWe WiFi or LAN module (Wi-Fi Kit, WiFi/LAN Kit,
Ezlink…) connected to your home network.

## Two ways to reach the inverter

**Local (recommended).** Gladys talks directly to the inverter on your network
(UDP port 8899): values every minute, daily energy, meter indexes,
temperature, and settings available in scenes. No account, no Internet
needed.

**SEMS cloud (optional).** The account of the SEMS Portal / SEMS+ app. Works
when Gladys is not on the same network as the inverter, and serves as a
fallback when the local connection fails. Read-only, refreshed every 5
minutes (the portal throttles faster requests).

With both configured, each inverter is **one** device: read locally, it
switches to the cloud when the local connection is lost (an orange dot on the
"cloud" badge shows it), and back. The standard **Prefer the local
connection** toggle chooses the channel tried first.

## Configuration

1. Install the integration from **Integrations → GoodWe**.
2. Local connection:
   - leave **Search the network for GoodWe inverters** on: Gladys broadcasts
     the GoodWe discovery request on your network;
   - if the inverter is not found (another subnet, a VLAN, a router that
     blocks broadcasts), enter its **IP address**. Give it a fixed address in
     your router (DHCP reservation) so it does not change.
3. Cloud (optional): enter the **e-mail address** and **password** of your
   SEMS account. Tip: create a dedicated _visitor_ account in the SEMS app
   (Plant → Visitors) rather than giving the owner account.
4. Click **Test the connection**: each inverter found is listed with its model
   and serial number.
5. Open the **Discovery** tab and add your inverter(s).

## Device features

Depending on the model and the connection, each inverter publishes:

| Feature                    | Unit | Notes                                   |
| -------------------------- | ---- | --------------------------------------- |
| Solar production           | W    | all                                     |
| Production today / total   | kWh  | local                                   |
| Grid power                 | W    | import > 0, export < 0 (meter required) |
| Grid import / export index | kWh  | ET, DT with smart meter                 |
| House consumption          | W    | meter required                          |
| Battery level              | %    | hybrids with battery                    |
| Battery charge/discharge   | W    | hybrids with battery                    |
| Battery charged/discharged | kWh  | ET                                      |
| Inverter temperature       | °C   | local                                   |
| Grid voltage               | V    | local                                   |

## Scenes

Triggers:

- **Solar production started / stopped** (sunrise, sunset; the energy of the
  day is available as a variable);
- **Solar surplus started / ended**: the power injected into the grid exceeds
  the threshold of the configuration (500 W by default). Ideal to start the
  water heater, a washing machine or the car charge;
- **Inverter fault** (error code and description as variables);
- **Inverter unreachable / back online**.

Actions:

- **Read the GoodWe inverter**: fresh values usable in the next actions
  (production, grid, consumption, battery);
- **Set the GoodWe operation mode** (ET family: general, backup, eco, peak
  shaving, self-use);
- **Limit the GoodWe grid export** (in W, 0 = zero export);
- **Set the GoodWe battery depth of discharge** (%).

Settings need the local connection. An action that the inverter cannot
perform returns **Applied = no** instead of failing: test it in the scene.

## Dashboard widgets

- **GoodWe inverter**: live solar, house, grid and battery tiles, the state of
  the inverter, its connection and a Refresh button;
- **GoodWe production**: production and consumption chart (24 h to a month)
  and the energy balance of the day (produced, imported, exported,
  self-sufficiency).

## Troubleshooting

- **No inverter found**: check that the inverter answers in the SEMS app,
  enter its IP address, and allow UDP port 8899 between Gladys and the
  inverter. Some recent dongles only talk to the cloud: use the SEMS account.
- **Cloud: "login refused"**: check the e-mail and password on
  semsportal.com. The portal limits the request rate: after a "slow down"
  message the integration waits 5 minutes on its own.
- **No grid / consumption values**: a grid-tied (DT) inverter needs a GoodWe
  smart meter for them.

GoodWe is a trademark of GoodWe Technologies Co., Ltd. This community
integration is not affiliated with GoodWe.
