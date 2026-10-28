import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { prospect, config, draft, now, input, payload } from './fixtures.mjs';
import { applyResearch } from '../../lib/hr-ops/model.mjs';
import { qualify, saveDraft, recordInteraction } from '../../lib/hr-ops/operations.mjs';
import { LocalRepository } from '../../lib/hr-ops/store.mjs';
import { profileUrl, linkedinPlan, LinkedinBrowser, attemptPath, attemptLinkedinSend, annotateConfirmedAttempt, repeatedLinkedinText } from '../../lib/hr-ops/linkedin-browser.mjs';
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

// HR_OPS_TEST_CHROMIUM_CHANNEL=chrome reuses an installed Chrome instead of downloading Playwright's Chromium.
const channel=process.env.HR_OPS_TEST_CHROMIUM_CHANNEL;
const browserAvailable=!!channel||existsSync(chromium.executablePath());
const noBrowser=!browserAvailable&&'Optional Chromium is not installed; no download or live LinkedIn test';
const launch=()=>chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},...(channel?{channel}:{})});
test('Playwright fixture verifies exact profile, composer, body and one send click', {skip:noBrowser},async t=>{
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage({serviceWorkers:'block'});
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

function fixtureWith(extra){const p=add(prospect()),c=config();qualify(p,c,now);saveDraft(p,{...draft(p),...extra},c,now);return {p,c};}
test('delivery methods are explicit and InMail alone carries a subject',()=>{
 const {p,c}=fixture();
 assert.throws(()=>linkedinPlan(p,c,{...args(p),method:'email'},now),/method/);
 assert.equal(linkedinPlan(p,c,args(p),now).method,'message');
 assert.equal(linkedinPlan(p,c,{...args(p),method:'connection_request'},now).method,'connection_request');
 assert.throws(()=>linkedinPlan(p,c,{...args(p),method:'inmail'},now),/InMail requires/);
 const s=fixtureWith({subject:'Backend searches'});
 assert.throws(()=>linkedinPlan(s.p,s.c,args(s.p),now),/Only InMail/);
 const plan=linkedinPlan(s.p,s.c,{...args(s.p),method:'inmail'},now);
 assert.equal(plan.subject,'Backend searches');assert.equal(plan.body,s.p.drafts[0].body);
});
test('agent-operated attempts record operator and method and respect the daily cap',async t=>{
 const {repo,c,plan}=await repository(t);let clicks=0;const driver={verify:async()=>{},clickSend:async()=>clicks++};
 mkdirSync(join(repo.dir,'delivery-attempts'),{recursive:true});
 writeFileSync(join(repo.dir,'delivery-attempts','linkedin-'+'0'.repeat(24)+'.json'),JSON.stringify({attempted_at:now.toISOString()}));
 await assert.rejects(attemptLinkedinSend(repo,c,plan,driver,auth,now,{operator:'agent',dailyCap:1}),/Daily LinkedIn cap/);
 assert.equal(clicks,0);assert(!existsSync(attemptPath(repo,plan)));
 await assert.rejects(attemptLinkedinSend(repo,c,plan,driver,auth,now,{operator:'robot'}),/Operator/);
 const {file,receipt}=await attemptLinkedinSend(repo,c,plan,driver,auth,now,{operator:'agent',dailyCap:2});
 assert.equal(clicks,1);assert.equal(receipt.operator,'agent');assert.equal(receipt.method,'message');
 annotateConfirmedAttempt(file,'synthetic-event','tool_confirmed_sent');
 assert.equal(JSON.parse(readFileSync(file,'utf8')).status,'tool_confirmed_sent');
 assert.throws(()=>annotateConfirmedAttempt(file,'again','tool_confirmed_sent'),/Unexpected attempt state/);
});
test('sent events keep their LinkedIn method and reject it elsewhere',async t=>{
 const {repo,c,p}=await repository(t);const d=p.drafts[0];
 const sent={id:'synthetic-invite',kind:'sent',at:now.toISOString(),channel:'linkedin',method:'connection_request',contact_id:d.contact_id,
  draft_id:d.id,content_hash:d.content_hash,message:d.body,reason:'Synthetic agent-confirmed invitation fixture',authorization:auth};
 assert.throws(()=>recordInteraction(structuredClone(p),{...sent,method:'fax'},c,now),/method/);
 assert.throws(()=>recordInteraction(structuredClone(p),{...sent,kind:'reply',response:'Thanks',message:undefined},c,now),/method/);
 await repo.update(p.id,'fixture-sent',record=>recordInteraction(record,sent,c,now),{expectedRevision:p.revision,now});
 assert.equal(repo.get(p.id).interactions.at(-1).method,'connection_request');
});
test('CLI validates agent authorization and login before any browser opens',()=>{
 const run=a=>spawnSync(process.execPath,['hr-ops-linkedin.mjs',...a],{encoding:'utf8',input:''});
 let r=run(['send','fixture','--authorization','/nonexistent/authorization.json']);
 assert.equal(r.status,1);assert.match(r.stderr,/readable JSON/);
 r=run(['preview','fixture','--authorization','x.json']);assert.equal(r.status,1);assert.match(r.stderr,/Preview takes no/);
 r=run(['login','--sender-profile-url',sender]);assert.equal(r.status,1);assert.match(r.stderr,/agents never log in/);
 r=run(['send','fixture','--daily-cap','0','--authorization','x.json']);assert.equal(r.status,1);
});

const invitationPage=({maxlength=300,pending=false,inMenu=false}={})=>`<main><h1>Alex Doe</h1>
 ${pending?'<button aria-label="Pending, click to withdraw invitation sent to Alex Doe">Pending</button>':''}
 ${inMenu?'<button aria-label="More actions" onclick="document.getElementById(\'menu\').style.display=\'block\'">More</button><div id="menu" style="display:none"><div role="button" aria-label="Invite Alex Doe to connect" onclick="document.getElementById(\'dlg\').style.display=\'block\'">Connect</div></div>'
  :'<button aria-label="Invite Alex Doe to connect" onclick="document.getElementById(\'dlg\').style.display=\'block\'">Connect</button>'}</main>
 <div id="dlg" role="dialog" style="display:none"><button onclick="document.getElementById(\'note\').style.display=\'block\'">Add a note</button>
 <textarea id="note" maxlength="${maxlength}" style="display:none"></textarea>
 <button aria-label="Send invitation" onclick="window.invites=(window.invites||0)+1;document.getElementById('dlg').style.display='none';document.querySelector('main').insertAdjacentHTML('beforeend','<button aria-label=&quot;Pending, click to withdraw invitation sent to Alex Doe&quot;>Pending</button>')">Send</button></div>`;
async function fixturePage(t,html){
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage({serviceWorkers:'block'});
 // All URLs are intercepted. These tests never contact LinkedIn or another server.
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:typeof html==='function'?html(r.request().url()):html}));return page;}
test('Playwright fixture sends one connection request with the exact note and observes it pending',{skip:noBrowser},async t=>{
 const {p,c}=fixture(),plan=linkedinPlan(p,c,{...args(p),method:'connection_request'},now);
 for(const inMenu of [false,true]){
  const page=await fixturePage(t,invitationPage({inMenu})),driver=new LinkedinBrowser(page);
  await driver.prepare(plan);assert.equal(await page.locator('#note').inputValue(),plan.body);
  assert.equal(await page.evaluate(()=>window.invites||0),0);assert.equal(await driver.confirmSent(plan,0),false);
  await driver.clickSend(plan);assert.equal(await page.evaluate(()=>window.invites),1);
  assert.equal(await driver.confirmSent(plan,2000),true);
 }
 await assert.rejects(new LinkedinBrowser(await fixturePage(t,invitationPage({maxlength:20}))).prepare(plan),/character invitation limit/);
 await assert.rejects(new LinkedinBrowser(await fixturePage(t,invitationPage({pending:true}))).prepare(plan),/already pending/);
});
const composerPage=({inmail=false}={})=>`<main><h1>Alex Doe</h1><button onclick="document.querySelector('.msg-overlay-conversation-bubble').style.display='block'">Message</button></main>
 <div class="msg-overlay-conversation-bubble" style="display:none"><div class="msg-overlay-bubble-header"><a href="/in/alex-doe">Alex Doe</a></div>
 ${inmail?'<input name="subject" placeholder="Subject">':''}<div class="msg-form__contenteditable" contenteditable="true" role="textbox"></div>
 <button onclick="window.sends=(window.sends||0)+1;const b=this.closest('.msg-overlay-conversation-bubble');const d=document.createElement('div');d.className='msg-s-event-listitem__body';d.textContent=b.querySelector('[role=textbox]').innerText;b.appendChild(d)">Send</button></div>`;
test('Playwright fixture sends a message or InMail once and confirms the exact text in the conversation',{skip:noBrowser},async t=>{
 const m=fixture(),message=linkedinPlan(m.p,m.c,args(m.p),now);
 let page=await fixturePage(t,composerPage()),driver=new LinkedinBrowser(page);
 await driver.prepare(message);assert.equal(await driver.confirmSent(message,0),false);
 await driver.clickSend(message);assert.equal(await page.evaluate(()=>window.sends),1);assert.equal(await driver.confirmSent(message,2000),true);
 const s=fixtureWith({subject:'Backend searches'}),inmail=linkedinPlan(s.p,s.c,{...args(s.p),method:'inmail'},now);
 page=await fixturePage(t,composerPage({inmail:true}));driver=new LinkedinBrowser(page);
 await driver.prepare(inmail);assert.equal(await page.locator('input[name=subject]').inputValue(),'Backend searches');
 await driver.clickSend(inmail);assert.equal(await driver.confirmSent(inmail,2000),true);
 await assert.rejects(new LinkedinBrowser(await fixturePage(t,composerPage())).prepare(inmail),/InMail composer/);
});
test('Playwright fixture requires the saved login to land on the sender profile',{skip:noBrowser},async t=>{
 const page=await fixturePage(t,u=>u.includes('/in/me')?'<script>location.replace("https://www.linkedin.com/in/test-sender")</script>':'<main><h1>Test Sender</h1></main>');
 await new LinkedinBrowser(page).verifyOwnProfile(sender,'Test Sender',{timeoutMs:3000});
 const login=await fixturePage(t,u=>u.includes('/in/me')?'<script>location.replace("https://www.linkedin.com/login")</script>':'<form>Sign in</form>');
 await assert.rejects(new LinkedinBrowser(login).verifyOwnProfile(sender,'Test Sender',{timeoutMs:1000}),/not logged in/);
});
test('a message repeating earlier LinkedIn wording, even with the name swapped, is never sent',async t=>{
 const {repo,c,p,plan}=await repository(t);let clicks=0;const driver={verify:async()=>{},clickSend:async()=>clicks++};
 const swapped=plan.body.replace(/^Alex/,'Jordan');
 assert.equal(repeatedLinkedinText({dir:repo.dir,list:()=>[]},plan),null);
 const other={name:'Other Co',contacts:[{id:'c2',name:'Jordan Smith'}],interactions:[{kind:'sent',channel:'linkedin',contact_id:'c2',draft_id:'other-draft',message:swapped}]};
 assert.match(repeatedLinkedinText({dir:repo.dir,list:()=>[other]},plan),/Jordan Smith at Other Co/);
 mkdirSync(join(repo.dir,'delivery-attempts'),{recursive:true});
 writeFileSync(join(repo.dir,'delivery-attempts','linkedin-'+'1'.repeat(24)+'.json'),JSON.stringify({attempted_at:'2020-01-01T00:00:00Z',plan:{draft_id:'other-draft',recipient_name:'Jordan Smith',body:swapped}}));
 await assert.rejects(attemptLinkedinSend(repo,c,plan,driver,auth,now),/repeats a LinkedIn message/);
 assert.equal(clicks,0);assert(!existsSync(attemptPath(repo,plan)));assert.equal(repo.get(p.id).interactions.length,0);
 writeFileSync(join(repo.dir,'delivery-attempts','linkedin-'+'1'.repeat(24)+'.json'),JSON.stringify({attempted_at:'2020-01-01T00:00:00Z',plan:{draft_id:'other-draft',recipient_name:'Jordan Smith',body:'Jordan, a completely different question about your data team?'}}));
 await attemptLinkedinSend(repo,c,plan,driver,auth,now);assert.equal(clicks,1);
});
