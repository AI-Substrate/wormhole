#!/usr/bin/env node

import { run, flush, handle } from '@oclif/core';

// ESM workaround for __dirname
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the CLI
run(process.argv.slice(2), import.meta.url)
  .then(() => flush())
  .catch((error) => handle(error));