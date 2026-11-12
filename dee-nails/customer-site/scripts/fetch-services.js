// Refresh the first-visit storefront fallback when the API is reachable.
// A failed fetch intentionally keeps the last committed snapshot.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const apiUrl = process.env.VITE_API_URL || 'http://localhost:8000';
const target = resolve('src/data/services.snapshot.json');
try {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/services/`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  const services = await response.json();
  if (!Array.isArray(services)) throw new Error('Unexpected services response');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(services, null, 2)}\n`);
  console.log(`Updated storefront snapshot (${services.length} services).`);
} catch (error) {
  try { await readFile(target, 'utf8'); console.warn(`Keeping existing storefront snapshot: ${error.message}`); }
  catch { console.warn(`No storefront snapshot available: ${error.message}`); }
}
