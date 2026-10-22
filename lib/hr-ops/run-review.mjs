import {assert, keys, text, hash, scoreProspect,domain} from './model.mjs';
import {candidateKey, scopeSummary} from './run-scope.mjs';
import {researchNextStep} from './operations.mjs';

// Review is an operator assessment, not a claim that all useful research is known.
export function continuationReview(state, records, config, now = new Date()) {
  const scope = scopeSummary(state);
  const queries = Math.max(0, state.limits.queries - state.attempts.filter(a=>a.kind==='query').length);
  const byId = new Map(records.map(p=>[p.id,p]));
  const matches=(p,name)=>candidateKey(p.name)===candidateKey(name)||state.attempts.some(a=>
    a.kind==='page'&&a.company&&a.candidate_names?.some(n=>candidateKey(n)===candidateKey(name))&&
    p.domains.includes(domain(a.company.includes('://')?a.company:'https://'+a.company)));
  const bindings=new Map(records.map(p=>[p.id,(scope?.candidates??[]).filter(name=>matches(p,name))]));
  const candidates = (scope?.candidates ?? []).map(name=>{
    const attempts = state.attempts.filter(a=>a.candidate_names?.some(n=>candidateKey(n)===candidateKey(name)));
    const origin=state.candidate_origins?.find(o=>candidateKey(o.name)===candidateKey(name));
    const sequences = [...new Set([...attempts.map(a=>a.sequence),...(origin?.source_sequence!=null?[origin.source_sequence]:[])])];
    const referenced = [...new Set((state.outcomes??[]).filter(o=>sequences.includes(o.sequence)).flatMap(o=>o.prospect_ids))];
    const ids=referenced.filter(id=>bindings.get(id)?.length===1&&candidateKey(bindings.get(id)[0])===candidateKey(name));
    const unmatched=referenced.filter(id=>bindings.get(id)?.length!==1);
    const pages = scope.pages_by_candidate[candidateKey(name)] ?? 0;
    // A fixed agency board can have earlier directory reads on the same company
    // domain. The existing domain cap includes those reads, independently of
    // the candidate cap. Do not advertise allowance the next request will deny.
    const companies=new Set(attempts.filter(a=>a.kind==='page'&&!a.directory&&a.company).map(a=>a.company));
    const domainRemaining=companies.size?Math.max(...[...companies].map(company=>
      state.limits.pages_per_company-state.attempts.filter(a=>a.kind==='page'&&a.company===company).length)):state.limits.pages_per_company;
    const pagesRemaining=Math.max(0,Math.min(state.limits.pages_per_company-pages,domainRemaining,scope.remaining_pages));
    return {name, origin:origin??null, attempt_sequences:sequences, pages_used:pages,
      pages_remaining:pagesRemaining,
      queries_remaining:queries,
      unmatched_prospect_ids:unmatched,
      prospects:ids.map(id=>{const p=byId.get(id);if(!p)return {id,missing:true};const s=scoreProspect(p,config,now);
        return {id,name:p.name,revision:p.revision,tier:s.tier,demand:s.opening_count,gaps:s.gaps,
          opening_verification_gaps:s.opening_verification_gaps,
          next_action:researchNextStep(p,config,now,pagesRemaining)};}),
      diagnostics:[...new Set((state.outcomes??[]).filter(o=>attempts.some(a=>a.sequence===o.sequence)).map(o=>o.category))],
      origin_diagnostics:origin?[...new Set((state.outcomes??[]).filter(o=>o.sequence===origin.source_sequence).map(o=>o.category))]:[]};
  });
  return {token:hash({attempts:state.attempts,outcomes:state.outcomes??[],scope:state.scope??null,candidate_origins:state.candidate_origins??[],
    records:records.map(p=>({id:p.id,revision:p.revision})).sort((a,b)=>a.id.localeCompare(b.id)),config,day:now.toISOString().slice(0,10)}),
    remaining_queries:queries,scope,candidates,
    note:'Candidate capacity limits new identities only. Existing candidates may still use remaining queries/pages. Known company-domain caps also include earlier directory reads, while pages_used counts candidate pages only. Allowance is not proof that a useful path exists; review each candidate and disclose deferred work.'};
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
    const offline=state.candidate_origins?.some(o=>candidateKey(o.name)===name&&o.source_url===null&&o.source_sequence===null);
    const unattempted=offline&&!state.attempts.some(a=>a.candidate_names?.some(n=>candidateKey(n)===name));
    assert(Array.isArray(row.attempt_sequences)&&(row.attempt_sequences.length>0||unattempted)&&new Set(row.attempt_sequences).size===row.attempt_sequences.length,
      'Candidate review needs supporting attempt sequences');
    if(unattempted&&row.attempt_sequences.length===0)
      assert(row.decision==='deferred','An offline candidate without research attempts must be explicitly deferred');
    assert(row.attempt_sequences.every(seq=>state.attempts.some(a=>a.sequence===seq&&(a.candidate_names?.some(n=>candidateKey(n)===name)||state.candidate_origins?.some(o=>candidateKey(o.name)===name&&o.source_sequence===seq)))),
      'Candidate review must reference its own attempts');
    return name;
  });
  assert(new Set(names).size===names.length&&names.length===expected.length&&expected.every(n=>names.includes(candidateKey(n))),
    'Review every admitted candidate exactly once');
}
