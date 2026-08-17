import { createHash } from 'node:crypto';
import { emitKeypressEvents } from 'node:readline';
import { pathToFileURL } from 'node:url';

export function hashPassword(password) {
    return createHash('sha256').update(String(password), 'utf8').digest('hex');
}

async function readHiddenPassword() {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
        throw new Error('Run this tool in an interactive terminal so the password can remain hidden.');
    }

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('Password (input hidden): ');

    return new Promise(function (resolve, reject) {
        let value = '';
        function finish(error) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('keypress', onKeypress);
            process.stdout.write('\n');
            if (error) reject(error);
            else resolve(value);
        }
        function onKeypress(character, key) {
            if (key && key.ctrl && key.name === 'c') return finish(new Error('Cancelled.'));
            if (key && (key.name === 'return' || key.name === 'enter')) return finish();
            if (key && key.name === 'backspace') {
                value = value.slice(0, -1);
                return;
            }
            if (!key || (!key.ctrl && !key.meta && character)) value += character;
        }
        process.stdin.on('keypress', onKeypress);
    });
}

async function main() {
    try {
        const password = await readHiddenPassword();
        if (!password) throw new Error('Password must not be empty.');
        process.stdout.write(`${hashPassword(password)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
