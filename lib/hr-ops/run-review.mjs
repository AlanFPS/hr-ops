import {assert, keys, text, hash, scoreProspect} from './model.mjs';
import {candidateKey, scopeSummary} from './run-scope.mjs';

// Review is an operator assessment, not a claim that all useful research is known.
export function continuationReview(state, records, config, now = new Date()) {
  const scope = scopeSummary(state);
  const queries = Math.max(0, state.limits.queries - state.attempts.filter(a=>a.kind==='query').length);
  const byId = new Map(records.map(p=>[p.id,p]));
  const candidates = (scope?.candidates ?? []).map(name=>{
    const attempts = state.attempts.filter(a=>a.candidate_names?.some(n=>candidateKey(n)===candidateKey(name)));
    const origin=state.candidate_origins?.find(o=>candidateKey(o.name)===candidateKey(name));
    const sequences = [...new Set([...attempts.map(a=>a.sequence),...(origin?[origin.source_sequence]:[])])];
    const ids = [...new Set((state.outcomes??[]).filter(o=>attempts.some(a=>a.sequence===o.sequence)).flatMap(o=>o.prospect_ids))];
    const pages = scope.pages_by_candidate[candidateKey(name)] ?? 0;
    return {name, origin:origin??null, attempt_sequences:sequences, pages_used:pages,
      pages_remaining:Math.max(0,Math.min(state.limits.pages_per_company-pages,scope.remaining_pages)),
      queries_remaining:queries,
      prospects:ids.map(id=>{const p=byId.get(id);if(!p)return {id,missing:true};const s=scoreProspect(p,config,now);
        return {id,name:p.name,revision:p.revision,tier:s.tier,demand:s.opening_count,gaps:s.gaps,
          opening_verification_gaps:s.opening_verification_gaps};}),
      diagnostics:[...new Set((state.outcomes??[]).filter(o=>sequences.includes(o.sequence)).map(o=>o.category))]};
  });
  return {token:hash({attempts:state.attempts,outcomes:state.outcomes??[],scope:state.scope??null,candidate_origins:state.candidate_origins??[],
    records:records.map(p=>({id:p.id,revision:p.revision})).sort((a,b)=>a.id.localeCompare(b.id)),config,day:now.toISOString().slice(0,10)}),
    remaining_queries:queries,scope,candidates,
    note:'Candidate capacity limits new identities only. Existing candidates may still use remaining queries/pages. Allowance is not proof that a useful path exists; review each candidate and disclose deferred work.'};
}

export function validateCompletionReview(review, state) {
  keys(review,['token','candidates'],'completion review');
  assert(typeof review.token==='string'&&/^[a-f0-9]{64}$/.test(review.token),'Invalid completion review token');
  assert(Array.isArray(review.candidates),'Completion review candidates required');
  const expected=scopeSummary(state)?.candidates??[];
  const names=review.candidates.map(row=>{
    keys(row,['name','decision','reason','attempt_sequences'],'candidate review');
    const name=candidateKey(row.name);
    assert(['no_useful_path','target_satisfied','budget_exhausted','deferred'].includes(row.decision),'Invalid candidate review decision');
    text(row.reason,'candidate stopping rationale',2000);
    assert(Array.isArray(row.attempt_sequences)&&row.attempt_sequences.length>0&&new Set(row.attempt_sequences).size===row.attempt_sequences.length,
      'Candidate review needs supporting attempt sequences');
    assert(row.attempt_sequences.every(seq=>state.attempts.some(a=>a.sequence===seq&&(a.candidate_names?.some(n=>candidateKey(n)===name)||state.candidate_origins?.some(o=>candidateKey(o.name)===name&&o.source_sequence===seq)))),
      'Candidate review must reference its own attempts');
    return name;
  });
  assert(new Set(names).size===names.length&&names.length===expected.length&&expected.every(n=>names.includes(candidateKey(n))),
    'Review every admitted candidate exactly once');
}
