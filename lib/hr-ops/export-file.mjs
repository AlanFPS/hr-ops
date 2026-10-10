import { lstatSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { writeFileAtomic } from '../../tracker-utils.mjs';

// Exports are restricted to a separate local directory, never canonical data.
export function saveExport(root, target, content) {
  const parts = target.replaceAll('\\', '/').split('/');
  if (parts.length < 3 || parts[0] !== 'local' || parts[1] !== 'exports' ||
      parts.some(p => !p || p === '.' || p === '..' || /[:\x00-\x1f]/.test(p)))
    throw new Error('--output must be a relative file under local/exports/');
  let path = resolve(root);
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    let stat;
    try { stat = lstatSync(path); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (index < parts.length - 1) {
        try { mkdirSync(path); }
        catch (createError) { if (createError.code !== 'EEXIST') throw createError; }
        // Another exporter may have created it since lstat. Recheck the type;
        // EEXIST alone is not proof that the winner created a safe directory.
        stat = lstatSync(path);
      }
    }
    if (stat) {
      if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()))
        throw new Error('Export path must not contain links or incompatible file types');
    }
  }
  writeFileAtomic(path, content);
  return path;
}
