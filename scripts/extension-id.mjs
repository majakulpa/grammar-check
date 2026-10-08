/** Prints the extension ID that the manifest's `key` produces. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const key = /'([A-Za-z0-9+/=]{100,})'/.exec(readFileSync('src/manifest.ts', 'utf8'))?.[1];
if (!key) throw new Error('No public key found in src/manifest.ts');

const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
console.log([...digest].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join(''));
