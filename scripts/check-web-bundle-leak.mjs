#!/usr/bin/env node
/**
 * Fails if the customer web production bundle mentions PedidosYa / channel / commission.
 * Usage: node scripts/check-web-bundle-leak.mjs [distDir]
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.resolve(root, process.argv[2] ?? 'apps/web/dist');

const FORBIDDEN = [/pedidosya/i, /commission/i, /\bchannelFee\b/i, /\bsalesChannel\b/i];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(js|css|html|json|map)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

async function main() {
  try {
    await stat(distDir);
  } catch {
    console.error(`Bundle dir not found: ${distDir}. Run apps/web build first.`);
    process.exit(1);
  }

  const files = await walk(distDir);
  const hits = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) {
        hits.push(`${path.relative(root, file)} matches ${pattern}`);
      }
    }
  }

  if (hits.length > 0) {
    console.error('Forbidden terms found in customer web bundle:');
    for (const hit of hits) console.error(`  - ${hit}`);
    process.exit(1);
  }

  console.log(`OK: no PedidosYa/channel/commission leaks in ${files.length} bundle files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
