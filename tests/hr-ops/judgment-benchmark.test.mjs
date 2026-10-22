import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scoreProspect} from '../../lib/hr-ops/model.mjs';
import {researchTasks,outreachBrief,saveDraft} from '../../lib/hr-ops/operations.mjs';
import {draftReviewIssues} from '../../lib/hr-ops/draft-review.mjs';
import {prospect,config,now,fact,draft} from './fixtures.mjs';
const data=JSON.parse(readFileSync(new URL('../../templates/hr-ops-judgment-cases.json',import.meta.url),'utf8'));

test('independent judgment packet hides reference answers and does not claim automatic semantic grading',()=>{
  const script=fileURLToPath(new URL('../../scripts/hr-ops-judgment.mjs',import.meta.url));
  const questions=JSON.parse(execFileSync(process.execPath,[script],{encoding:'utf8'}));
  assert.equal(questions.automated_semantic_grade,false);assert.equal(questions.cases.length,4);
  assert(questions.cases.every(c=>!c.reference));assert.equal(new Set(data.cases.map(c=>c.id)).size,4);
  const reference=JSON.parse(execFileSync(process.execPath,[script,'--reference'],{encoding:'utf8'}));
  assert(reference.cases.every(c=>c.reference.correction&&c.reference.why));
});

test('office-market: corrected role-country unknown cannot earn US demand or silently become qualified',()=>{
  const p=prospect(),c=config();p.evidence[0].excerpt=data.cases.find(c=>c.id==='office-market').source;
  for(const o of p.openings){o.verification.market={status:'unknown',evidence:[],rationale:'Offices are not role-specific hiring countries.'};
    o.eligibility={status:'possible',evidence:['site'],rationale:'Broad regional scope needs country confirmation.',geography:'Americas and Europe'};}
  assert.equal(p.facts.us_market.value,true,'Company market fit is separate');
  const score=scoreProspect(p,c,now);assert.equal(score.opening_count,2);assert.equal(score.us_opening_count,0);
  assert.equal(score.eligible_opening_count,0);assert.equal(score.tier,'PROVISIONAL');
  assert.equal(outreachBrief(p,c,now).intent,'exploratory');assert.throws(()=>saveDraft(p,draft(p),c,now),/intent|exploratory/i);
});

test('team-engagement: observed team presence keeps engagement and recruiting partners unknown',()=>{
  const p=prospect(),c=config();p.evidence[0].excerpt=data.cases.find(c=>c.id==='team-engagement').source;
  p.facts.latam_presence=fact('Team locations include Brazil and Argentina');
  assert.equal(p.facts.recruiting_partners.confidence,'unknown');assert.equal(p.facts.recruiting_structure.confidence,'unknown');
  const tasks=researchTasks(p,c,now);assert(tasks.tasks.some(t=>t.includes('Team locations establish presence only')));
  assert(outreachBrief(p,c,now).review_guidance.some(t=>t.includes('not proof of direct employment')));
  assert.equal(p.facts.recruiting_partners.confidence,'unknown','Reading briefs must not manufacture employment/supplier facts');
});

test('overlapping-postings: unsupported shared-client and exact hires claims fail; neutral exploratory wording survives',()=>{
  const p=prospect(),c=config();p.icp='agency';p.facts.tech_focus=fact(true);p.facts.recruiter_count=fact(10);
  p.contacts[0].title='Founder';
  for(const [i,o] of p.openings.entries()){o.hiring_for='client';o.posting_id='posting-'+i;o.board='https://fictional.example/jobs';}
  p.evidence[0].excerpt=data.cases.find(c=>c.id==='overlapping-postings').source;
  const d=draft(p);d.body='Alex, could we help your client with two hires?';
  let issues=draftReviewIssues(d,p,c,now);assert(issues.some(x=>x.includes('shared client')));assert(issues.some(x=>x.includes('Exact vacancy/hire')));
  d.body='Alex, I noticed your backend listings. Would exploring a LATAM delivery partnership for future searches be useful?';
  assert.deepEqual(draftReviewIssues(d,p,c,now),[]);
  assert(researchTasks(p,c,now).tasks.some(t=>t.includes('neither prove distinct requisitions nor prove duplicates')));
});

test('restricted-agency: current client demand does not become LATAM-serviceable or prove supplier appetite',()=>{
  const p=prospect(),c=config();p.icp='agency';p.facts.tech_focus=fact(true);p.facts.recruiter_count=fact(10);
  p.contacts[0].title='Founder';
  p.evidence[0].excerpt=data.cases.find(c=>c.id==='restricted-agency').source;
  p.facts.latam_compatibility={value:null,confidence:'unknown',evidence:[]};
  for(const o of p.openings){o.hiring_for='client';o.eligibility={status:'restricted',evidence:['site'],rationale:'US only authorization required.',geography:'United States only'};}
  const score=scoreProspect(p,c,now);assert.equal(score.eligible_opening_count,0);assert.notEqual(score.tier,'QUALIFIED');
  assert.equal(p.facts.latam_delivery_request.confidence,'unknown');
  assert.equal(score.tier,'PROVISIONAL');assert.equal(outreachBrief(p,c,now).intent,'exploratory');
  const d=draft(p);assert.throws(()=>saveDraft(p,d,c,now),/intent|exploratory/i);
});
