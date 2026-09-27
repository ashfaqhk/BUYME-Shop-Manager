import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../dist/public');
const workerPath = path.join(root, 'sw.js');
const worker = await readFile(workerPath, 'utf8');
if (!worker.includes('__BUYME_CACHE_VERSION__') || !worker.includes('__BUYME_PRECACHE__')) {
  throw new Error('Offline worker placeholders were not copied into the build.');
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  }));
  return files.flat();
}

const files = (await filesIn(root)).filter((file) => !file.endsWith('/sw.js') && !file.endsWith('/robots.txt'));
const revision = createHash('sha256');
const urls = ['/'];
for (const file of files.sort()) {
  const url = `/${path.relative(root, file).split(path.sep).join('/')}`;
  if (url !== '/index.html') urls.push(url);
  revision.update(url);
  revision.update(await readFile(file));
}

const result = worker
  .replace('__BUYME_CACHE_VERSION__', `buyme-shell-${revision.digest('hex').slice(0, 16)}`)
  .replace('__BUYME_PRECACHE__', JSON.stringify(urls));
await writeFile(workerPath, result);
console.log(`Prepared offline app shell with ${urls.length} files.`);