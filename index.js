// -----------------------------------------------------------------------------
// Entry point of the GoodWe integration for Gladys Assistant.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
//
// All the handlers are registered by src/app.js, BEFORE connect().
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
createApp(gladys);

// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT). Nothing long-lived to stop on our side: the
// UDP sockets live for one request.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

logger.info('Starting the GoodWe integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
