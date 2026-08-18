#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const updater = require('./lib/admin-update.js');

function argumentsByName(values) {
    const result = {};
    for (let index = 0; index < values.length; index += 2) {
        const key = values[index];
        if (!key || !key.startsWith('--') || values[index + 1] === undefined) throw new Error('Invalid command arguments.');
        result[key.slice(2)] = values[index + 1];
    }
    return result;
}

function workingTreePaths(repositoryRoot) {
    const output = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: repositoryRoot,
        encoding: 'utf8'
    });
    return output.split(/\r?\n/).filter(Boolean).map(function (line) {
        const value = line.slice(3).trim();
        return value.includes(' -> ') ? value.split(' -> ').pop() : value;
    });
}

try {
    const args = argumentsByName(process.argv.slice(2));
    if (!args.package || !args.repository || !args['expected-base'] || !args.result) {
        throw new Error('Required arguments: --package, --repository, --expected-base, --result.');
    }
    const repositoryRoot = path.resolve(args.repository);
    const payload = JSON.parse(fs.readFileSync(path.resolve(args.package), 'utf8'));
    const result = updater.applyAdminUpdate(payload, {
        repositoryRoot: repositoryRoot,
        expectedBaseSha: args['expected-base']
    });
    const actualPaths = workingTreePaths(repositoryRoot);
    updater.assertAllowedChangedPaths(result.updateType, actualPaths);
    updater.assertExactChangedPaths(result.changedPaths, actualPaths);
    fs.writeFileSync(path.resolve(args.result), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`ADMIN_UPDATE_APPLIED=${result.updateId}\n`);
} catch (error) {
    process.stderr.write(`ADMIN_UPDATE_FAILED=${error && error.message ? error.message : 'Unknown error'}\n`);
    process.exitCode = 1;
}
