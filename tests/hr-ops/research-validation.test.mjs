import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyResearch,blankProspect,scoreProspect} from '../../lib/hr-ops/model.mjs';
import {validateProspect} from '../../lib/hr-ops/validation.mjs';
import {research,outreachBrief,researchTasks,draftCurrent,saveDraft,dossier} from '../../lib/hr-ops/operations.mjs';
import {LocalRepository,initialize} from '../../lib/hr-ops/store.mjs';
import {acceptanceSummary} from '../../lib/hr-ops/acceptance.mjs';
import {researchYield} from '../../lib/hr-ops/research-outcomes.mjs';
import {now,input,payload,prospect,config,draft,evidence,verification,fact} from './fixtures.mjs';

function single(){const p=prospect();p.openings=p.openings.slice(0,1);return p;}
test('multi-practice agency with verified technology recruiting remains provisionally admissible',()=>{
 const p=single();p.icp='agency';p.facts.tech_focus=fact(true);
 p.evidence[0].excerpt='We recruit across finance, operations and technology. Our IT practice is seeking a backend engineer for a client. This role is US on-site only.';
 p.openings[0].hiring_for='client';p.openings[0].eligibility={status:'restricted',evidence:['site'],geography:'US on-site',rationale:'The client requires office attendance.'};
 p.facts.latam_compatibility=fact('unknown');
 const s=scoreProspect(p,config(),now);assert.equal(s.tier,'PROVISIONAL');assert.equal(s.eligible_opening_count,0);
 p.facts.tech_focus=fact(false);assert.equal(scoreProspect(p,config(),now).tier,'RESEARCHING');
});
test('generic US benefits cannot supply a reviewed US opening scope and do not negate explicit Brazil eligibility',()=>{
 const p=prospect();p.evidence[0].excerpt='Our US benefits include health insurance. Backend Engineer 1: Remote Brazil. Backend Engineer 2: Remote Canada or Remote, country unspecified.';
 p.openings[0].eligibility={status:'eligible',evidence:['site'],geography:'Brazil',rationale:'The role explicitly lists Brazil.'};
 p.openings[0].verification.market={status:'non_us',evidence:['site'],rationale:'Role location is Brazil.'};
 p.openings[1].verification.market={status:'unknown',evidence:['site'],rationale:'Generic US benefits do not establish role hiring scope.'};
 p.openings[1].eligibility={status:'unknown',evidence:['site'],geography:'Unknown',rationale:'Unspecified Remote does not establish LATAM eligibility.'};
 const s=scoreProspect(p,config(),now);assert.equal(s.us_opening_count,0);assert.equal(s.eligible_opening_count,1);assert.equal(s.tier,'QUALIFIED');
});
test('legacy review boolean remains readable but cannot supply demand or draft eligibility',()=>{
 const p=prospect();for(const o of p.openings)delete o.verification;
 validateProspect(p,now);const s=scoreProspect(p,config(),now);
 assert.equal(s.opening_count,0);assert.equal(s.tier,'RESEARCHING');
 assert.equal(outreachBrief(p,config(),now).blocked,true);
 assert.equal(researchTasks(p,config(),now).opening_verification_gaps.length,2);
 assert.match(dossier(p,config(),now),/role: not recorded/);
 assert.match(dossier(p,config(),now),/demand credited: false/);
});
for(const [check,status] of [['role','unreadable'],['ownership','unverified'],['attribution','unknown'],['currency','conflicting']])test(`${check} gaps cannot be bypassed with reviewed:true or eligible geography`,()=>{
 const p=single();p.openings[0].verification[check].status=status;
 const s=scoreProspect(p,config(),now);assert.equal(s.opening_count,0);assert.equal(s.eligible_opening_count,0);
 assert.equal(s.tier,'RESEARCHING');assert.match(s.opening_verification_gaps[0].reasons.join(' '),new RegExp(check));
});
test('agency board titles and generic client services do not substitute for role text',()=>{
 const p=single();p.icp='agency';p.facts.tech_focus=fact(true);p.openings[0].hiring_for='client';
 p.openings[0].verification.role={status:'unreadable',evidence:['site'],rationale:'The job detail returns only a board list.'};
 assert.equal(scoreProspect(p,config(),now).tier,'RESEARCHING');
 p.openings[0].verification.role=verification().role;
 p.openings[0].eligibility={status:'restricted',evidence:['site'],geography:'US on-site',rationale:'Office attendance required.'};
 assert.equal(scoreProspect(p,config(),now).tier,'PROVISIONAL');
 assert.equal(scoreProspect(p,config(),now).eligible_opening_count,0);
 p.openings[0].hiring_for='self';assert.equal(scoreProspect(p,config(),now).opening_count,0);
});
test('official ATS ownership requires an official outbound link for the actual board',()=>{
 const p=blankProspect(input(),now),data=payload(),o=data.openings[0];data.openings=[o];
 o.url='https://jobs.example/fictional/backend';o.board='https://jobs.example/fictional';
 o.verification.ownership={status:'verified',method:'official_link',url:o.board,evidence:['link'],rationale:'Company careers page links to this board.'};
 data.evidence=[evidence('link',`Open positions: ${o.board}`)];
 applyResearch(p,data,now);assert.equal(scoreProspect(p,config(),now).opening_count,1);
 for(const mutate of [
  x=>x.openings[0].verification.ownership.url='https://jobs.example/wrong',
  x=>x.evidence[0].url='https://aggregator.example/fictional',
  x=>x.evidence[0].excerpt='The ATS slug and logo look identical.',
  x=>x.openings[0].verification.ownership.method='content_match'
 ]){const bad=structuredClone(data);mutate(bad);assert.throws(()=>applyResearch(blankProspect(input(),now),bad,now),/ownership|Ownership|Official|Official-link/);}
});
test('secondary-only currency and invalid references cannot certify an opening',()=>{
 const data=payload();data.evidence=[{...evidence('secondary'),source_type:'secondary'}];
 data.openings[0].verification.currency.evidence=['secondary'];
 assert.throws(()=>applyResearch(blankProspect(input(),now),data,now),/primary evidence/);
 data.openings[0].verification.currency.evidence=['missing'];
 assert.throws(()=>applyResearch(blankProspect(input(),now),data,now),/evidence/i);
});
test('verification evidence must remain fresh independently of the role timestamp',()=>{
 const p=single(),later=new Date(+now+31*86400000);p.evidence.push(evidence('new','Current role',later.toISOString()));
 p.openings[0].evidence=['new'];p.openings[0].verified_at=later.toISOString();
 const s=scoreProspect(p,config(),later);assert.equal(s.opening_count,0);
 assert(s.opening_verification_gaps[0].reasons.every(r=>r.includes('stale')));
});
test('complete-board conflict cannot be cleared by boolean review or pre-conflict evidence',()=>{
 const p=single(),at=new Date(+now+3600000);p.collection={at:at.toISOString(),openings:[],complete:true};
 p.openings[0].reconciliation_needed=true;
 applyResearch(p,{openings:[{...p.openings[0],reviewed:true}]},at);
 assert.equal(p.openings[0].reconciliation_needed,true);
 const after=new Date(+at+1000),o=structuredClone(p.openings[0]);o.verified_at=after.toISOString();
 o.verification.currency={status:'confirmed',evidence:['fresh-role'],rationale:'Employer restored the role after the complete-board absence.'};
 applyResearch(p,{evidence:[evidence('fresh-role','Backend services role reopened; apply now.',after.toISOString())],openings:[o]},after);
 assert.equal(p.openings[0].reconciliation_needed,false);assert.equal(scoreProspect(p,config(),after).opening_count,1);
});
test('omitted verification cannot inherit a prior review onto changed role content',()=>{
 const p=single(),o={...p.openings[0],title:'Different Backend Role'};delete o.verification;
 applyResearch(p,{openings:[o]},now);assert.equal(scoreProspect(p,config(),now).opening_count,0);
});
test('recorded manual currency conflicts remain pending through incomplete follow-on reviews',()=>{
 const p=single(),o=structuredClone(p.openings[0]),later=new Date(+now+3600000);
 o.verification.currency={status:'conflicting',evidence:['conflict'],rationale:'Current official inventory disagrees with a secondary role.'};
 applyResearch(p,{evidence:[evidence('conflict','Primary board has no such role.',later.toISOString())],openings:[o]},later);assert.equal(p.openings[0].reconciliation_needed,true);
 const incomplete={...p.openings[0],reviewed:true};delete incomplete.verification;
 applyResearch(p,{openings:[incomplete]},later);assert.equal(p.openings[0].reconciliation_needed,true);
 applyResearch(p,{openings:[{...p.openings[0],reviewed:true,verification:verification()}]},later);
 assert.equal(p.openings[0].reconciliation_at,later.toISOString());
 assert.equal(p.openings[0].reconciliation_needed,true);assert.equal(scoreProspect(p,config(),later).opening_count,0);
});
test('conflicting currency invalidates drafts without rewriting history or commercial state',async t=>{
 const root=mkdtempSync(join(tmpdir(),'hr-research-proof-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 await initialize(root,config());const repo=new LocalRepository(root);let p=(await repo.discover(input(),{now})).prospect;
 await repo.update(p.id,'research',x=>research(x,payload(),config(),now),{expectedRevision:1,now});
 await repo.update(p.id,'draft',x=>saveDraft(x,draft(x),config(),now),{expectedRevision:2,now});
 p=repo.get(p.id);const oldHistory=structuredClone(p.history);
 const openings=p.openings.map(o=>({...o,verification:{...o.verification,currency:{status:'conflicting',evidence:['site'],rationale:'Secondary posting conflicts with the complete current primary board.'}}}));
 await repo.update(p.id,'research',x=>research(x,{openings},config(),now),{expectedRevision:p.revision,now});
 const saved=new LocalRepository(root).get(p.id);assert.equal(saved.score.opening_count,0);
 assert.equal(draftCurrent(saved.drafts[0],saved,config(),now),false);
 assert.deepEqual(saved.history.slice(0,oldHistory.length),oldHistory);
 saved.status='CLIENT';research(saved,{openings},config(),now);assert.equal(saved.status,'CLIENT');
});
test('U.S. company presence is distinct from opening geography in acceptance counts',async t=>{
 const root=mkdtempSync(join(tmpdir(),'hr-demand-scope-'));t.after(()=>rmSync(root,{recursive:true,force:true}));await initialize(root,config());
 const repo=new LocalRepository(root),p=(await repo.discover(input(),{now})).prospect,data=payload();
 data.openings.forEach(o=>o.verification.market={status:'non_us',evidence:['site'],rationale:'The reviewed role is located in Ireland.'});
 await repo.update(p.id,'research',x=>research(x,data,config(),now),{expectedRevision:1,now});
 const summary=acceptanceSummary(root,now);assert.equal(summary.rows[0].target_match,true);assert.equal(summary.rows[0].us_opening_target_match,false);
 assert.equal(summary.by_icp.find(x=>x.icp==='startup').us_opening_target_matches,0);
});
test('historical source claims do not rank as validated demand after evidence conflicts',()=>{
 const p=single();p.id='a'.repeat(16);p.openings[0].verification.currency.status='conflicting';
 const run={attempts:[{sequence:1,attribution:{source_id:'source',icp:'startup'}}],outcomes:[{sequence:1,category:'read_ok',prospect_ids:[]},{sequence:1,category:'demand_match',prospect_ids:[p.id]}]};
 const result=researchYield([run],[p],x=>scoreProspect(x,config(),now))[0];
 assert.equal(result.distinct_reported_demand_matches,1);assert.equal(result.distinct_validated_demand_matches,0);
});
