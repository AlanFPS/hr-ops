import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function requireRuntime(version = process.versions.node) {
  if (!/^\d+\./.test(version) || Number(version.split('.')[0]) < 24)
    throw new Error(`HR-Ops requires Node >=24; received ${version}. Invoke the verified Node executable by absolute path.`);
}

// Use the caller's verified runtime, never a shell's independently resolved node.
export function runHrText(args, { cwd, env = process.env, input } = {}) {
  requireRuntime();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../hr-ops.mjs', import.meta.url)), ...args], {
    cwd, env, input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? `HR-Ops exited ${result.status}: ${result.stderr.trim()}`);
  return result.stdout;
}

export function runHr(args, options = {}) {
  const formatIndex = args.indexOf('--format');
  if (!args.length || args[0] === 'help' || args.includes('--help') ||
      args.includes('--summary') || args.includes('--markdown') ||
      (formatIndex !== -1 && args[formatIndex + 1] !== 'json' && !args.includes('--output')))
    throw new Error('runHr requires JSON output; use runHrText for help, summaries, Markdown or CSV');
  return JSON.parse(runHrText(args, options));
}

// A callback is dispatched only after a real, successful reservation. Callers
// must not catch a reservation failure and then independently perform the read.
export async function withReservation(run, attempt, dispatch, options = {}) {
  const receipt = runHr(['budget', '--run', run, '--input', '-'], { ...options, input: attempt });
  if (receipt.dispatch_allowed !== true || receipt.dry_run !== false ||
      receipt.reservation?.kind !== attempt.kind || receipt.reservation?.target !== attempt.target)
    throw new Error('Research reservation did not authorize dispatch');
  return { receipt, result: await dispatch(receipt) };
}
