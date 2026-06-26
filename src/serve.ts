#!/usr/bin/env node
import { startWebServer } from "./web/server.js";

const port = Number(process.env.PORT ?? process.argv[2] ?? 3847);
await startWebServer(port);