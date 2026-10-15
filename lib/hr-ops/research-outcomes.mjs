import { assert, keys, text, stamp } from './model.mjs';

export const OUTCOMES = ['read_ok','access_failure','empty_board','demand_match','no_demand','unresolved'];
export function validateAttribution(value) {
  if (value === undefined) return;
  keys(value, ['source_id','icp','query_recipe'], 'research attribution');
  text(value.source_id, 'source_id', 200);
  assert(['agency','startup','both'].includes(value.icp), 'attribution.icp required');
  if (value.query_recipe !== undefined) text(value.query_recipe, 'query_recipe', 500);
}
export function validateOutcome(value, state) {
  keys(value, ['sequence','category','prospect_ids','note','recorded_at'], 'research outcome');
  assert(state.attempts.some(a => a.sequence === value.sequence), 'Outcome requires an existing reservation');
  assert(OUTCOMES.includes(value.category), 'Invalid research outcome category');
  assert(Array.isArray(value.prospect_ids) && value.prospect_ids.every(id => typeof id==='string' && /^[a-f0-9]{16}$/.test(id)) && new Set(value.prospect_ids).size === value.prospect_ids.length, 'Invalid outcome prospect IDs');
  text(value.note, 'Outcome note', 2000);
  stamp(value.recorded_at);
}
export function researchYield(runs, records, evaluate) {
  const groups = new Map(), byId = new Map(records.map(p=>[p.id,p]));
  for (const run of runs) for (const a of run.attempts) {
    const source = a.attribution?.source_id ?? 'unattributed', icp = a.attribution?.icp ?? 'unknown';
    const key = JSON.stringify([source,icp]);
    if (!groups.has(key)) groups.set(key,{source,icp,attempts:0,access_failures:0,outcomes_unrecorded:0,demand:new Set(),ids:new Set(),unresolved:0});
    const g=groups.get(key);g.attempts++;
    const outcomes=(run.outcomes??[]).filter(o=>o.sequence===a.sequence);
    if (!outcomes.length) g.outcomes_unrecorded++;
    if(outcomes.some(o=>o.category==='access_failure'))g.access_failures++;
    if(outcomes.some(o=>o.category==='unresolved'))g.unresolved++;
    for(const o of outcomes)for(const id of o.prospect_ids){g.ids.add(id);if(o.category==='demand_match')g.demand.add(id);}
  }
  return [...groups.values()].map(g=>({source:g.source,icp:g.icp,attempts:g.attempts,access_failures:g.access_failures,outcomes_unrecorded:g.outcomes_unrecorded,
    distinct_reported_demand_matches:g.demand.size,linked_prospects:g.ids.size,unresolved_attempts:g.unresolved,
    evaluations:[...g.ids].map(id=>{const p=byId.get(id);return p?{id,icp:p.icp,tier:evaluate(p).tier,gaps:evaluate(p).gaps}:{id,missing:true};})}));
}
