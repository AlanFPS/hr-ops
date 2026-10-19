import { assert, keys, text } from './model.mjs';

// Optional run-specific bounds. Legacy max_candidates remains per operation.
export function candidateKey(name) {
  return text(name, 'candidate name', 200).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
export function validateScope(scope) {
  keys(scope, ['candidates', 'pages', 'directory_pages'], 'run scope');
  for (const key of ['candidates', 'pages'])
    assert(Number.isSafeInteger(scope[key]) && scope[key] > 0, `run scope ${key} must be a positive integer`);
  assert(Number.isSafeInteger(scope.directory_pages) && scope.directory_pages >= 0,
    'run scope directory_pages must be a nonnegative integer');
  assert(scope.directory_pages <= scope.pages, 'Directory cap exceeds page cap');
}
export function scopeSummary(state) {
  try { return summarize(state); }
  catch (error) {
    error.retryable = false;
    error.code = /scope exhausted/.test(error.message) ? 'HR_OPS_BUDGET_EXHAUSTED' : 'HR_OPS_SCOPE_INVALID';
    throw error;
  }
}
function summarize(state) {
  if (!Object.hasOwn(state,'scope')) return null;
  validateScope(state.scope);
  const names = new Map(), pages = new Map(), owners = new Map();
  for(const origin of state.candidate_origins??[])names.set(candidateKey(origin.name),origin.name.trim());
  let total = 0, directories = 0;
  for (const a of state.attempts) {
    assert(Array.isArray(a.candidate_names), 'Scoped requests require candidate_names (empty only for broad searches/directories)');
    const ids = a.candidate_names.map(candidateKey);
    assert(new Set(ids).size === ids.length, 'Duplicate candidate names in request');
    assert(a.directory === undefined || typeof a.directory === 'boolean', 'directory must be boolean');
    assert(!a.directory || a.kind === 'page', 'Only page requests can be directories');
    if (a.kind === 'page') {
      assert(a.directory ? ids.length === 0 : ids.length === 1, 'Prospect pages require one candidate; directory pages require none');
      total++;
      if (a.directory) directories++;
      else {
        assert(!a.company || !owners.has(a.company) || owners.get(a.company) === ids[0], 'Reuse the registered candidate name for this company domain');
        if(a.company) owners.set(a.company, ids[0]);
        pages.set(ids[0], (pages.get(ids[0]) ?? 0) + 1);
      }
    }
    ids.forEach((id, i) => names.set(id, names.get(id) ?? a.candidate_names[i].trim()));
  }
  assert(names.size <= state.scope.candidates, 'Research candidate scope exhausted');
  assert(total <= state.scope.pages, 'Research total page scope exhausted');
  assert(directories <= state.scope.directory_pages, 'Research directory scope exhausted');
  assert([...pages.values()].every(n => n <= state.limits.pages_per_company), 'Research candidate page scope exhausted (including aliases)');
  return { candidates: [...names.values()], candidate_count: names.size, pages: total, directory_pages: directories,
    next_action:total>=state.scope.pages?'stop_total_page_budget':names.size>=state.scope.candidates?'continue_admitted_candidate_checks':'discover_or_research',
    pages_by_candidate: Object.fromEntries(pages), remaining_candidates: state.scope.candidates - names.size,
    remaining_pages: state.scope.pages - total, remaining_directory_pages: state.scope.directory_pages - directories };
}
