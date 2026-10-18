import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {LocalRepository,initialize} from '../../lib/hr-ops/store.mjs';
import {reserveResearch,researchBudget,updateRun,captureSource} from '../../lib/hr-ops/research-run.mjs';
import {continuationReview} from '../../lib/hr-ops/run-review.mjs';
import {draftReviewIssues} from '../../lib/hr-ops/draft-review.mjs';
import {scoreProspect} from '../../lib/hr-ops/model.mjs';
import {saveDraft,draftCurrent,outreachBrief} from '../../lib/hr-ops/operations.mjs';
import {validateProspect} from '../../lib/hr-ops/validation.mjs';
import {runHr,withReservation} from '../../lib/hr-ops/client.mjs';
import {config,now,prospect,draft,fact} from './fixtures.mjs';

async function setup(t){const root=fs.mkdtempSync(path.join(tmpdir(),'hr-review-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));await initialize(root,config());return {root,repo:new LocalRepository(root),c:config()};}
async function scoped(t){const s=await setup(t);await updateRun(s.repo,s.c,'review',{action:'configure',scope:{candidates:2,pages:8,directory_pages:1}});
  await reserveResearch(s.repo,s.c,'review',{kind:'query',target:'Alpha Beta official sites',candidate_names:['Alpha','Beta']});
  await reserveResearch(s.repo,s.c,'review',{kind:'page',target:'https://alpha.example/jobs',company:'https://alpha.example',candidate_names:['Alpha']});return s;}
const reviewed=check=>({token:check.token,candidates:check.candidates.map(x=>({name:x.name,decision:'deferred',reason:'Further official identity or role research remains; operator is pausing',attempt_sequences:x.attempt_sequences}))});

test('candidate cap retains per-candidate queries/pages and query-only candidates',async t=>{
  const {repo,c}=await scoped(t),before=researchBudget(repo,c,'review');
  const result=await updateRun(repo,c,'review',{action:'review'}),check=result.continuation_review;
  assert.equal(check.scope.remaining_candidates,0);assert.equal(check.remaining_queries,19);
  assert.deepEqual(check.candidates.map(x=>[x.name,x.pages_remaining,x.queries_remaining]),[['Alpha',5,19],['Beta',6,19]]);
  assert.deepEqual(researchBudget(repo,c,'review'),before,'Review must not mutate a ledger');
  await reserveResearch(repo,c,'review',{kind:'query',target:'Beta official site',candidate_names:['Beta']});
  assert.equal(researchBudget(repo,c,'review').attempts.length,3);
});
test('scoped completion requires every candidate and its own supporting attempts',async t=>{
  const {repo,c}=await scoped(t),check=(await updateRun(repo,c,'review',{action:'review'})).continuation_review;
  const base={action:'complete',reason:'Bounded pause'};
  await assert.rejects(updateRun(repo,c,'review',base));
  const review=reviewed(check);review.candidates.pop();
  await assert.rejects(updateRun(repo,c,'review',{...base,review}),/every admitted candidate/);
  const wrong=reviewed(check);wrong.candidates[1].attempt_sequences=[2];
  await assert.rejects(updateRun(repo,c,'review',{...base,review:wrong}),/own attempts/);
  assert.notEqual(researchBudget(repo,c,'review').status,'complete');
});
test('candidate exhaustion cannot masquerade as request exhaustion; explicit deferral survives restart',async t=>{
  const {repo,c}=await scoped(t),check=(await updateRun(repo,c,'review',{action:'review'})).continuation_review;
  const review=reviewed(check);review.candidates[0].decision='budget_exhausted';
  await assert.rejects(updateRun(repo,c,'review',{action:'complete',reason:'Candidate cap',review}),/still has request allowance/);
  review.candidates[0].decision='deferred';
  await updateRun(repo,c,'review',{action:'complete',reason:'Targets unmet; useful work deferred',review});
  assert.deepEqual(researchBudget(new LocalRepository(repo.root),c,'review').completion_review,review);
  await updateRun(repo,c,'review',{action:'resume'});assert.equal(researchBudget(repo,c,'review').completion_review,undefined);
  assert.equal(researchBudget(repo,c,'review').attempts.length,2);
});
test('completion review becomes stale after a new request or interpretation',async t=>{
  const {repo,c}=await scoped(t),check=(await updateRun(repo,c,'review',{action:'review'})).continuation_review;
  await updateRun(repo,c,'review',{action:'outcome',outcome:{sequence:2,category:'javascript_only',prospect_ids:[],note:'Board requires JavaScript'}});
  await assert.rejects(updateRun(repo,c,'review',{action:'complete',reason:'Pause',review:reviewed(check)}),/stale/);
  const next=(await updateRun(repo,c,'review',{action:'review'})).continuation_review;
  await reserveResearch(repo,c,'review',{kind:'query',target:'Beta current jobs',candidate_names:['Beta']});
  await assert.rejects(updateRun(repo,c,'review',{action:'complete',reason:'Pause',review:reviewed(next)}),/stale/);
});
test('review tokens include record revisions and configuration without volatile score timestamps',()=>{
  const state={limits:{queries:20,pages_per_company:6},attempts:[]},p=prospect(),c=config();
  const a=continuationReview(state,[p],c,now),b=continuationReview(state,[p],c,new Date(+now+1000));assert.equal(a.token,b.token);
  p.revision++;assert.notEqual(continuationReview(state,[p],c,now).token,a.token);
  c.freshness.openings++;assert.notEqual(continuationReview(state,[p],c,now).token,b.token);
});
test('legacy unscoped completion stays readable and CLI rejects completion key overrides',async t=>{
  const {repo,c,root}=await setup(t);await updateRun(repo,c,'legacy',{action:'complete'});
  assert.equal(researchBudget(repo,c,'legacy').status,'complete');
  assert.throws(()=>runHr(['run','--run','legacy','--action','complete','--input','-'],{cwd:root,env:{...process.env,HR_OPS_ROOT:root},input:{reason:'x',action:'resume'}}),/unsupported field action/);
});
test('scripted dispatch waits for the completed reservation and never runs after a denied candidate',async t=>{
  const {root,repo,c}=await scoped(t),options={cwd:root,env:{...process.env,HR_OPS_ROOT:root}};
  let calls=0;
  await withReservation('review',{kind:'query',target:'Alpha official board',candidate_names:['Alpha']},receipt=>{
    assert.equal(receipt.dispatch_allowed,true);assert.equal(researchBudget(repo,c,'review').attempts.at(-1).sequence,receipt.reservation.sequence);calls++;
  },options);
  await assert.rejects(withReservation('review',{kind:'query',target:'Gamma official site',candidate_names:['Gamma']},()=>calls++,options),/candidate scope exhausted/);
  assert.equal(calls,1);
});
test('long navigation pages with explicit job-list JavaScript gates are not read_ok',async t=>{
  const {repo,c}=await setup(t);
  for(const gate of ['JavaScript must be enabled in order to view listings','JavaScript is required to load the job listings']){
    const result=await captureSource(repo,c,'capture',{company:'https://fictional.example',url:'https://fictional.example/jobs'},
      {fetchText:async()=>`<nav>${'About our company and services '.repeat(50)}</nav><main>${gate}</main>`});
    assert.equal(result.collection_diagnostic,'javascript_only');
  }
});
test('job requirements mentioning JavaScript and harmless browser advice do not become empty or unreadable boards',async t=>{
  const {repo,c}=await setup(t);
  const result=await captureSource(repo,c,'capture',{company:'https://fictional.example',url:'https://fictional.example/jobs'},
    {fetchText:async()=>`<main>Backend engineer. JavaScript is required for this role. ${'Build production APIs and backend services. '.repeat(30)}</main><footer>Enable JavaScript for an enhanced experience.</footer>`});
  assert.equal(result.collection_diagnostic,'read_ok');
});
test('agency drafts reject shared-client wording across confidential searches, with a usable neutral correction',()=>{
  const p=prospect(),c=config();p.icp='agency';p.facts.tech_focus=fact(true);p.openings.forEach(o=>o.hiring_for='client');p.contacts[0].title='Founder';
  const d=draft(p);d.intent=scoreProspect(p,c,now).tier==='PROVISIONAL'?'exploratory':'qualified';
  const old=d.quality.next_step,next='Would that client consider LATAM engineers for either search?';
  d.body=d.body.replace(old,next);d.quality.next_step=next;d.quality.hypothesis_claim=next;d.claims[1].text=next;
  assert.throws(()=>saveDraft(p,d,c,now),/one shared client/);
  const neutral='Could LATAM sourcing support help with either search?';d.body=d.body.replace(next,neutral);d.quality.next_step=neutral;d.quality.hypothesis_claim=neutral;d.claims[1].text=neutral;
  saveDraft(p,d,c,now);assert.equal(p.drafts.length,1);assert.equal(draftCurrent(p.drafts[0],p,c,now),true);
});
test('single agency opening can refer to its client; unsupported or duplicate opening selections fail',()=>{
  const p=prospect(),c=config();p.icp='agency';const d=draft(p);d.quality.opening_ids=[p.openings[0].id];p.openings.forEach(o=>o.hiring_for='client');
  d.body='Would that client consider a future LATAM search?';assert.deepEqual(draftReviewIssues(d,p,c,now),[]);
  d.quality.opening_ids=['missing'];assert.match(draftReviewIssues(d,p,c,now).join(' '),/current validated demand/);
  d.quality.opening_ids=[p.openings[0].id,p.openings[0].id];assert.match(draftReviewIssues(d,p,c,now).join(' '),/distinct/);
});
test('different posting IDs or titles do not prove an exact number of hires',()=>{
  const p=prospect(),c=config(),d=draft(p);p.openings.forEach((o,i)=>Object.assign(o,{board:'https://fictional.example/jobs',posting_id:'posting-'+i}));
  for(const body of ['You have two backend openings.','You need 2 hires.']){d.body=body;assert.match(draftReviewIssues(d,p,c,now).join(' '),/distinct supported requisitions/);}
  p.openings.forEach((o,i)=>o.requisition_id='req-'+i);
  assert.match(draftReviewIssues(d,p,c,now).join(' '),/explicit primary count quote/,'Distinct requisitions do not establish exact hire headcount');
  d.body='You have two backend openings.';assert.deepEqual(draftReviewIssues(d,p,c,now),[]);
  p.openings[1].requisition_id=p.openings[0].requisition_id;assert.match(draftReviewIssues(d,p,c,now).join(' '),/distinct supported requisitions/);
});
test('an explicit primary count quote can support a quantity but an authored summary cannot',()=>{
  const p=prospect(),c=config(),d=draft(p);d.body='You have three vacancies.';
  d.claims.push({text:'three vacancies',kind:'observed',evidence:['count']});
  p.evidence.push({id:'count',url:p.website,source_type:'primary',excerpt_kind:'quote',excerpt:'We have three vacancies.',observed_at:now.toISOString()});
  assert.deepEqual(draftReviewIssues(d,p,c,now),[]);
  p.evidence.at(-1).excerpt_kind='summary';assert.match(draftReviewIssues(d,p,c,now).join(' '),/explicit primary count quote/);
});
test('historical drafts remain readable but need a new opening-scoped review to be current',()=>{
  const p=prospect(),c=config();saveDraft(p,draft(p),c,now);delete p.drafts[0].quality.opening_ids;
  validateProspect(p,now);assert.equal(draftCurrent(p.drafts[0],p,c,now),false);
  assert(outreachBrief(p,c,now).review_guidance.some(s=>s.includes('shared client')));
});
