import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gitHooksDir = join(root, '.git', 'hooks');

if (!existsSync(join(root, '.git'))) process.exit(0); // not a git checkout

if (!existsSync(gitHooksDir)) mkdirSync(gitHooksDir, { recursive: true });

copyFileSync(join(root, 'scripts', 'git-hooks', 'pre-push'), join(gitHooksDir, 'pre-push'));
console.log('Git hooks installed.');
