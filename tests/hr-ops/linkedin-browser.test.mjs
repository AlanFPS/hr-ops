import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { prospect, config, draft, now, input, payload } from './fixtures.mjs';
import { applyResearch } from '../../lib/hr-ops/model.mjs';
import { qualify, saveDraft, recordInteraction } from '../../lib/hr-ops/operations.mjs';
import { LocalRepository } from '../../lib/hr-ops/store.mjs';
import { profileUrl, linkedinPlan, LinkedinBrowser, attemptPath, attemptLinkedinSend } from '../../lib/hr-ops/linkedin-browser.mjs';
const target='https://www.linkedin.com/in/alex-doe',sender='https://www.linkedin.com/in/test-sender';
function add(p){p.evidence.push({id:'profile-link',url:target,observed_at:now.toISOString(),excerpt:'Alex Doe profile link',source_type:'secondary'});return p;}
function fixture(){const p=add(prospect()),c=config();qualify(p,c,now);saveDraft(p,draft(p),c,now);return {p,c};}
function args(p){return {draft_id:p.drafts[0].id,profile_url:target,sender_profile_url:sender,expected_revision:p.revision};}
const auth={actor:'human',reference:'synthetic-test',statement:'Synthetic test authorization only'};

test('LinkedIn plans reject untrusted URLs, stale drafts and incorrect revision',()=>{
 const {p,c}=fixture();assert.equal(profileUrl(target+'/?trk=test'),target);
 for(const u of ['http://www.linkedin.com/in/alex-doe','https://linkedin.com.evil.test/in/alex-doe','https://user@linkedin.com/in/alex-doe','https://www.linkedin.com/messaging/','https://www.linkedin.com/in/a%2Fb'])assert.throws(()=>profileUrl(u));
 assert.throws(()=>linkedinPlan(p,c,{...args(p),expected_revision:999},now),/Revision/);
 assert.throws(()=>linkedinPlan(p,c,{...args(p),profile_url:sender},now),/Sender and recipient/);
 assert.throws(()=>linkedinPlan(p,c,{...args(p),profile_url:'https://www.linkedin.com/in/other'},now),/identity/);
 const plan=linkedinPlan(p,c,args(p),now);assert.equal(plan.body,p.drafts[0].body);
 p.drafts[0].stale=true;assert.throws(()=>linkedinPlan(p,c,args(p),now),/current ready/);
});
test('LinkedIn plans retain suppression, hold, closure and exact-message boundaries',()=>{
 for(const flag of ['suppressed','hold']){const {p,c}=fixture();p[flag]=true;assert.throws(()=>linkedinPlan(p,c,args(p),now));}
 const {p,c}=fixture();p.status='LOST';assert.throws(()=>linkedinPlan(p,c,args(p),now));
 const f=fixture();f.p.interactions.push({kind:'sent',draft_id:f.p.drafts[0].id});assert.throws(()=>linkedinPlan(f.p,f.c,args(f.p),now),/already recorded/);
 const changed=fixture();changed.c.firm.name='Different firm';assert.throws(()=>linkedinPlan(changed.p,changed.c,args(changed.p),now),/current ready/);
});
async function repository(t){const root=mkdtempSync(join(tmpdir(),'hr-linkedin-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const repo=new LocalRepository(root),c=config();
 const d=await repo.discover(input(),{now});await repo.update(d.prospect.id,'fixture',p=>{applyResearch(p,payload(),now);add(p);qualify(p,c,now);return saveDraft(p,draft(p),c,now);},{expectedRevision:1,now});
 const p=repo.get(d.prospect.id);return {repo,c,p,plan:linkedinPlan(p,c,args(p),now)};}
test('failed preflight does not attempt delivery; failed click is durable and cannot be retried',async t=>{
 const {repo,c,p,plan}=await repository(t);let clicks=0;
 await assert.rejects(attemptLinkedinSend(repo,c,plan,{verify:async()=>{throw Error('wrong recipient');},clickSend:async()=>clicks++},auth,now),/wrong recipient/);
 assert(!existsSync(attemptPath(repo,plan)));
 const driver={verify:async()=>{},clickSend:async()=>{clicks++;throw Error('timeout after possible click');}};
 await assert.rejects(attemptLinkedinSend(repo,c,plan,driver,auth,now),/unconfirmed/);
 assert.equal(readFileSync(attemptPath(repo,plan),'utf8').includes('attempted_unconfirmed'),true);
 await assert.rejects(attemptLinkedinSend(repo,c,plan,driver,auth,now),/already exists/);
 assert.equal(clicks,1);assert.equal(repo.get(p.id).interactions.length,0);
});
test('click success alone does not fabricate delivery, and changed state blocks dispatch',async t=>{
 const {repo,c,p,plan}=await repository(t);let clicks=0;
 await attemptLinkedinSend(repo,c,plan,{verify:async()=>{},clickSend:async()=>clicks++},auth,now);
 assert.equal(clicks,1);assert.equal(repo.get(p.id).interactions.length,0);
 const other=await repository(t);
 await other.repo.update(other.p.id,'fixture-hold',p=>{p.hold=true;},{expectedRevision:other.p.revision,now});
 await assert.rejects(attemptLinkedinSend(other.repo,other.c,other.plan,{verify:async()=>{},clickSend:async()=>clicks++},auth,now),/Revision/);
 assert.equal(clicks,1);
});
test('mutated approval plans and non-human authorization never dispatch',async t=>{
 const {repo,c,plan}=await repository(t);let clicks=0;const driver={verify:async()=>{},clickSend:async()=>clicks++};
 await assert.rejects(attemptLinkedinSend(repo,c,{...plan,body:'Changed message'},driver,auth,now),/modified/);
 await assert.rejects(attemptLinkedinSend(repo,c,plan,driver,{...auth,actor:'agent'},now),/human/);
 assert.equal(clicks,0);assert(!existsSync(attemptPath(repo,plan)));
});

test('human review advances one revision without changing the approved message',async t=>{
 const {repo,c,p,plan}=await repository(t);
 await repo.update(p.id,'fixture-review',record=>recordInteraction(record,{
   id:'synthetic-browser-review',kind:'review',at:now.toISOString(),draft_id:plan.draft_id,
   content_hash:plan.content_hash,reason:'Synthetic human confirmation fixture',authorization:auth
 },c,now),{expectedRevision:p.revision,now});
 const reviewed=repo.get(p.id);
 assert.equal(reviewed.revision,plan.revision+1);
 assert.equal(reviewed.drafts[0].review,'human_review_recorded');
 const approved=linkedinPlan(reviewed,c,{...plan.input,expected_revision:plan.revision+1},now);
 for(const key of ['body','content_hash','firm_hash','contact_id','recipient_name'])assert.equal(approved[key],plan[key]);
 let clicks=0;
 await assert.rejects(attemptLinkedinSend(repo,c,plan,{verify:async()=>{},clickSend:async()=>clicks++},auth,now),/Revision/);
 await attemptLinkedinSend(repo,c,approved,{verify:async()=>{},clickSend:async()=>clicks++},auth,now);
 assert.equal(clicks,1);
 assert.deepEqual(repo.get(p.id).interactions.map(e=>e.kind),['review']);
});
test('CLI refuses piped or headless send before opening a browser',()=>{
 const result=spawnSync(process.execPath,['hr-ops-linkedin.mjs','send','fixture'],{encoding:'utf8',input:'OPEN\nREADY\nSEND anything\nSENT\n'});
 assert.equal(result.status,1);assert.match(result.stderr,/interactive human-operated terminal/);
});

const browserAvailable=existsSync(chromium.executablePath());
test('Playwright fixture verifies exact profile, composer, body and one send click', {skip:!browserAvailable&&'Optional Chromium is not installed; no download or live LinkedIn test'},async t=>{
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'}});t.after(()=>browser.close());const page=await browser.newPage({serviceWorkers:'block'});
 // All URLs are intercepted. This test never contacts LinkedIn or another server.
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<main><h1>Alex Doe</h1><button onclick="document.querySelector('.msg-overlay-conversation-bubble').style.display='block'">Message</button></main>
 <div class="msg-overlay-conversation-bubble" style="display:none"><div class="msg-overlay-bubble-header"><a href="/in/alex-doe">Alex Doe</a></div><div class="msg-form__contenteditable" contenteditable="true" role="textbox"></div><button onclick="window.sends=(window.sends||0)+1">Send</button></div>`}));
 const {p,c}=fixture(),plan=linkedinPlan(p,c,args(p),now),driver=new LinkedinBrowser(page);
 await driver.prepare(plan);assert.equal(await page.evaluate(()=>window.sends||0),0);
 await driver.clickSend(plan);assert.equal(await page.evaluate(()=>window.sends),1);
 await page.locator('[role=textbox]').fill('Changed text');await assert.rejects(driver.verify(plan),/differs/);
 await page.locator('[role=textbox]').fill(plan.body);
 await page.locator('.msg-overlay-bubble-header a').evaluate(a=>a.href='/in/wrong-person');await assert.rejects(driver.verify(plan),/recipient-matched/);
 await page.locator('.msg-overlay-bubble-header a').evaluate(a=>a.href='/in/alex-doe');
 await page.locator('.msg-overlay-bubble-header').evaluate(h=>h.insertAdjacentHTML('beforeend','<a href="/in/second-person">Second Person</a>'));await assert.rejects(driver.verify(plan),/multiple recipients/);
 await page.locator('.msg-overlay-bubble-header a').last().evaluate(a=>a.remove());
 await page.locator('.msg-overlay-conversation-bubble').evaluate(b=>b.insertAdjacentHTML('beforeend','<input name="subject" placeholder="Subject">'));await assert.rejects(driver.verify(plan),/InMail/);
});
