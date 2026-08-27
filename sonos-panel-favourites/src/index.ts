import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import * as log from "./logger.js";

const configPath = process.argv[2] ?? "/data/options.json";

log.info("Sonos Panel Favourites");
log.info("=======================\n");

const config = loadConfig(resolve(configPath));

const app = createServer();

app.listen(config.port, "0.0.0.0", () => {
  log.info(`Listening on 0.0.0.0:${config.port}`);
  log.info(`Web UI: http://<host>:${config.port}/`);
  log.info(`Panel feed: http://<host>:${config.port}/favourites.json`);
});
