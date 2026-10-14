# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- the inverter model and the connection used (local or SEMS cloud);
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove passwords, tokens, serial numbers and
  addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes,
including how it stores and sends the SEMS credentials (they never leave the
container except to the SEMS login endpoint, over HTTPS) and the commands it
sends to the inverters on the local network.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the GoodWe inverters, their WiFi/LAN modules and firmware, and the SEMS portal
(report those to GoodWe). Note that the local GoodWe protocol (UDP 8899) has no
authentication by design: anyone on the same network can read and configure
the inverter, with or without this integration. Keep the inverter on a trusted
network.

## Security notes for users

- Prefer a dedicated SEMS **visitor** account over the owner account.
- The settings scene actions (operation mode, export limit, depth of
  discharge) change the inverter configuration: restrict who can edit scenes
  in Gladys.
