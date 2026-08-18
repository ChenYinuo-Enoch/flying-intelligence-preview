#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const updater = require('./lib/admin-update.js');

try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--package') throw new Error('Required argument: --package <path>.');
    const packagePath = path.resolve(args[1]);
    const payload = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    updater.validatePublishPackage(payload);
    process.stdout.write('PACKAGE_VALIDATION=PASS\n');
} catch (error) {
    process.stderr.write(`PACKAGE_VALIDATION=FAILED: ${error && error.message ? error.message : 'Unknown error'}\n`);
    process.exitCode = 1;
}
