import { assert, hash } from './model.mjs';
import { profileUrl } from './linkedin-browser.mjs';
import { threadUrl, readInbox, changeInbox, pendingReview } from './inbox-state.mjs';
import { importThread, contactMatches } from './inbox-import.mjs';

// Only displayed dates/times are parsed. Opaque message IDs are never decoded into timestamps.
export function displayedTime(day, clock, now=new Date(), timezone='UTC') {
  const parts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const today=parts(now);let date;
  if(/^today$/i.test(day))date=new Date(Date.UTC(today.year,today.month-1,today.day));
  else if(/^yesterday$/i.test(day))date=new Date(Date.UTC(today.year,today.month-1,today.day-1));
  else {
    const m=/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(day.trim());
    const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    if(!m||!months.includes(m[1].slice(0,3).toLowerCase()))return null;
    let year=Number(m[3]??today.year),month=months.indexOf(m[1].slice(0,3).toLowerCase()),dd=Number(m[2]);
    if(!m[3]&&(month+1>today.month||(month+1===today.month&&dd>today.day)))year--;
    date=new Date(Date.UTC(year,month,dd));if(date.getUTCMonth()!==month||date.getUTCDate()!==dd)return null;
  }
  const t=/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock.trim());if(!t||Number(t[1])<1||Number(t[1])>12||Number(t[2])>59)return null;
  const hour=Number(t[1])%12+(t[3].toUpperCase()==='PM'?12:0),minute=Number(t[2]);
  const wall=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hour,minute);
  // Test timezone offsets on either side of the date; ambiguous DST minutes stay unknown.
  const offsets=new Set([-36,0,36].map(h=>{const d=new Date(wall+h*3600000),p=parts(d);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)-d.getTime();}));
  const hits=[...offsets].map(o=>new Date(wall-o)).filter(d=>{const p=parts(d);return p.year===date.getUTCFullYear()&&p.month===date.getUTCMonth()+1&&p.day===date.getUTCDate()&&p.hour===hour&&p.minute===minute;});
  return hits.length===1&&hits[0]<=now?hits[0].toISOString():null;
}

export class LinkedinInboxBrowser {
  constructor(page){this.page=page;page.setDefaultTimeout(10000);}
  async verifyAccount(expected) {
    await this.page.goto('https://www.linkedin.com/in/me/',{waitUntil:'domcontentloaded'});
    await this.page.waitForURL(u=>u.pathname!=='/in/me/' && u.pathname.startsWith('/in/'));
    assert(profileUrl(this.page.url())===profileUrl(expected),'Logged-in account does not match the expected sender profile');
    return {url:profileUrl(this.page.url()),name:(await this.page.title()).replace(/\s*\|\s*LinkedIn\s*$/,'').trim()};
  }
  async folder(name) {
    assert(['focused','other'].includes(name),'Unsupported inbox folder');
    await this.page.goto('https://www.linkedin.com/messaging/',{waitUntil:'domcontentloaded'});
    const pill=this.page.locator('[data-test-messaging-inbox-filters__folder-pill]');await pill.waitFor({state:'visible'});
    if((await pill.innerText()).trim().toLowerCase()!==name){await pill.click();await this.page.locator(`[data-test-messaging-inbox-filters__folder-dropdown="${name}"]`).click();}
    await this.page.waitForFunction(n=>document.querySelector('[data-test-messaging-inbox-filters__folder-pill]')?.textContent.trim().toLowerCase()===n,name);
  }
  async rows() {
    assert(new URL(this.page.url()).pathname.startsWith('/messaging/'),'Unexpected inbox redirect');
    return this.page.locator('main .msg-conversation-listitem').evaluateAll(xs=>xs.map(e=>({
      name:e.querySelector('.msg-conversation-listitem__participant-names')?.textContent.trim()??'',
      day:e.querySelector('time')?.textContent.trim()??'',
      snippet:e.querySelector('.msg-conversation-card__message-snippet')?.textContent.trim()??'',
    })));
  }
  async more() {
    const button=this.page.getByRole('button',{name:'Load more conversations',exact:true});
    if(!await button.count()||!await button.isVisible())return false;
    const count=await this.page.locator('main .msg-conversation-listitem').count();await button.click();
    await this.page.waitForFunction(n=>document.querySelectorAll('main .msg-conversation-listitem').length>n,count,{timeout:10000});return true;
  }
  async read(index,limit=1000) {
    const rows=this.page.locator('main .msg-conversation-listitem__link');
    const wasActive=await rows.nth(index).evaluate(e=>e.classList.contains('msg-conversations-container__convo-item-link--active'));
    const before=this.page.url();await rows.nth(index).click();
    await this.page.waitForURL(u=>/\/messaging\/thread\/[^/]+\//.test(u.pathname)&&(wasActive||u.href!==before));
    return this.snapshot(limit);
  }
  async older(limit=1000) {
    const list=this.page.locator('main .msg-thread--pillar .msg-s-message-list');
    assert(await list.count()===1,'Unsupported conversation history layout');
    const before=await this.page.locator('main .msg-thread--pillar .msg-s-event-listitem').first().getAttribute('data-event-urn');
    await list.evaluate(e=>{e.scrollTop=getComputedStyle(e).flexDirection==='column-reverse'?-e.scrollHeight:0;});
    try{await this.page.waitForFunction(id=>document.querySelector('main .msg-thread--pillar .msg-s-event-listitem')?.getAttribute('data-event-urn')!==id,before,{timeout:2000});}
    catch{return null;}
    return this.snapshot(limit);
  }
  async snapshot(limit=1000) {
    const pane=this.page.locator('main .msg-thread--pillar');await pane.waitFor({state:'visible'});
    assert(await pane.count()===1,'Ambiguous active thread');
    const observed_at=new Date().toISOString(),timezone=await this.page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);
    const raw=await pane.evaluate((e,limit)=>{
      const header=e.querySelector('.msg-thread__link-to-profile'),names=e.querySelectorAll('.msg-title-bar .msg-thread__link-to-profile');let day='';
      return {profile_url:header?.href??null,name:(header?.innerText.trim()??'').split('\n')[0],participant_count:names.length===1?2:null,
        truncated:e.querySelectorAll('.msg-s-message-list__event').length>limit,
        messages:[...e.querySelectorAll('.msg-s-message-list__event')].slice(0,limit).map(row=>{
          const heading=row.querySelector('.msg-s-message-list__time-heading');if(heading)day=heading.textContent.trim();
          const item=row.querySelector('.msg-s-event-listitem'),time=row.querySelector('.msg-s-message-group__timestamp');
          return {id:item?.getAttribute('data-event-urn')??null,body:row.querySelector('.msg-s-event-listitem__body')?.innerText??'',
            direction:item?(item.classList.contains('msg-s-event-listitem--other')?'incoming':'outgoing'):null,
            day,clock:time?.textContent.trim()??'',datetime:time?.getAttribute('datetime')??null,
            edited:/\bEdited\b/.test(row.querySelector('.msg-s-message-group__meta')?.textContent??''),
            attachment:!!row.querySelector('.msg-s-event-listitem__attachment-item')};
        }).filter(x=>x.id||x.body)};
    },limit);
    return {...raw,thread_url:threadUrl(this.page.url()),observed_at,messages:raw.messages.map(m=>{
      const exact=m.datetime&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(m.datetime)?m.datetime:null;
      const at=exact??displayedTime(m.day,m.clock,new Date(observed_at),timezone);
      return {id:m.id,body:m.body,direction:m.direction,at,timestamp_precision:at?(exact?'exact':'minute'):null,
        timestamp_label:[m.day,m.clock].join(' '),edited:m.edited,attachment:m.attachment};})};
  }
}

export async function scanInbox(repo,c,runId,driver,{maxConversations=100,maxMessages=1000}={}) {
  assert(Number.isInteger(maxConversations)&&maxConversations>0&&maxConversations<=100,'Conversation limit must be 1..100');
  assert(Number.isInteger(maxMessages)&&maxMessages>0&&maxMessages<=1000,'Message limit must be 1..1000');
  let run=readInbox(repo).runs[runId];assert(run,'Unknown inbox run');let conversations=0,messages=0;
  try{
    await driver.verifyAccount(run.sender_profile_url);
    await changeInbox(repo,s=>{s.runs[runId].status='active';});
    for(const folder of ['focused','other']){
      if(run.folders.includes(folder))continue;
      await driver.folder(folder);let index=0,folderComplete=false;
      while(!folderComplete){
        const rows=await driver.rows();assert(rows.length,'Empty or unsupported inbox layout; coverage unverified');
        for(;index<rows.length;index++){
          const row=rows[index];const checkpoint=hash(JSON.stringify([folder,row.name,row.day,row.snippet]));
          if(run.visited.includes(checkpoint))continue;
          if(conversations>=maxConversations||messages>=maxMessages)throw Error('Invocation limit reached; resume the same run');
          let thread=await driver.read(index,maxMessages-messages);conversations++;
          assert(thread.messages.length,'No readable message history; coverage unverified');
          if(thread.truncated)throw Error('Visible conversation exceeds the remaining message bound; coverage incomplete');
          const matches=contactMatches(repo.list(),thread.profile_url);
          const bound=readInbox(repo).bindings?.[thread.profile_url];
          const known=matches.length===1?matches[0]:bound?{p:repo.get(bound.prospect_id),c:{id:bound.contact_id}}:null;
          // Only business threads need retained history. Stop at the time-window boundary
          // or a bounded history read; a stalled UI never proves that older context is absent.
          if(known&&driver.older&&(bound?.business_confirmed||known.p.interactions.some(e=>e.kind==='sent'&&e.contact_id===known.c.id))){
            const reachesBoundary=()=>thread.messages.some(m=>m.at&&Date.parse(m.at)<Date.parse(run.since));
            for(let page=0;page<5&&!reachesBoundary();page++){
              const older=await driver.older(maxMessages-messages);if(!older)break;
              if(older.truncated)throw Error('Older history exceeds remaining message bound; coverage incomplete');
              const ids=new Set(older.messages.filter(m=>m.id).map(m=>m.id));
              thread={...older,messages:[...older.messages,...thread.messages.filter(m=>!m.id||!ids.has(m.id))]};
              if(thread.messages.length>maxMessages-messages)throw Error('Combined history exceeds remaining message bound; coverage incomplete');
            }
            if(!reachesBoundary())await changeInbox(repo,s=>{pendingReview(s,runId,thread,'Older business history coverage could not be established');s.runs[runId].history_incomplete=true;});
          }
          if(messages+thread.messages.length>maxMessages){await changeInbox(repo,s=>pendingReview(s,runId,thread,'Conversation exceeds remaining message allowance; inspect in a fresh bounded invocation'));throw Error('Message limit would be exceeded; thread left for review/resume');}
          messages+=thread.messages.length;
          // Never persist unrelated unknown conversation bodies. Identity-only review is created by importThread.
          const within=thread.messages.some(m=>!m.at||Date.parse(m.at)>=Date.parse(run.since));
          if(within){
            const current=thread.messages.filter(m=>!m.at||Date.parse(m.at)>=Date.parse(run.since));
            const context=thread.messages.filter(m=>m.direction==='outgoing'&&m.at&&Date.parse(m.at)<Date.parse(run.since)).at(-1);
            const imported=await importThread(repo,c,runId,{...thread,messages:context?[context,...current]:current});
            if(imported.incomplete)throw Error('Conversation import interrupted: '+imported.error);
          }
          await changeInbox(repo,s=>{s.runs[runId].visited.push(checkpoint);s.runs[runId].observed_messages+=thread.messages.length;if(!within)s.runs[runId].skipped++;});
          run=readInbox(repo).runs[runId];
        }
        // Do not assume list order or stop at the first old conversation.
        folderComplete=!await driver.more();
      }
      await changeInbox(repo,s=>{s.runs[runId].folders.push(folder);});run=readInbox(repo).runs[runId];
    }
    return changeInbox(repo,s=>Object.assign(s.runs[runId],{status:s.runs[runId].history_incomplete?'partial':'complete',checked_at:new Date().toISOString(),coverage_note:s.runs[runId].history_incomplete?'Folders exhausted, but older business history needs review. Start a fresh scan after resolving coverage.':'Focused and Other folders exhausted; archived/spam excluded. Pending message reviews remain separate.'}));
  }catch(error){return changeInbox(repo,s=>Object.assign(s.runs[runId],{status:'partial',checked_at:new Date().toISOString(),coverage_note:error.message}));}
}
