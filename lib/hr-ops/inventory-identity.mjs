import {assert,keys,text,domain,hash,fresh} from './model.mjs';
import {inventoryView,reviewInventory,assertCompanyWebsite as website,readIdentityCapture as captured} from './inventory.mjs';
import {researchBudget} from './research-run.mjs';
import {readCapture} from './feed-captures.mjs';

const host=value=>domain(value).replace(/\.$/,'');
function context(repo,c,input,now){
  assert(/^[a-f0-9]{24}$/.test(input.observation_id),'Use a stable inventory observation ID');
  const view=inventoryView(repo,c,{now,limit:10000});
  const group=view.companies.find(g=>g.observations.some(o=>o.id===input.observation_id));
  assert(group,'Unknown inventory observation ID');
  const observation=group.observations.find(o=>o.id===input.observation_id);
  return {view,group,observation,run:researchBudget(repo,c,input.run)};
}
const groupSummary=g=>({id:g.id,name:g.name,domains:g.domains,identity_status:g.identity_status,queue_blocker:g.queue_blocker,
  prospect_id:g.prospect_id,state:g.state,observations:g.observations.map(o=>({id:o.id,name:o.name,website_claim:o.website_claim,source:o.source,review:o.review}))});

// Read-only assistance over existing captures. A proposed host is still a hint.
export function inventoryIdentityPacket(repo,c,input,{now=new Date()}={}){
  keys(input,['observation_id','run','website'],'inventory identity assistance');
  if(input.website!==undefined)website(input.website);
  const {view,group,observation,run}=context(repo,c,input,now);
  const domains=new Set([...group.domains,...(input.website?[host(input.website)]:[])]);
  const names=new Set(group.names.map(n=>n.normalize('NFKC').toLowerCase().trim()));
  const feedRaw=new Set();
  for(const o of group.observations)if(o.run===run.run&&o.capture_id){
    const capture=readCapture(repo,o.capture_id);
    for(const request of capture.requests??[])feedRaw.add(request.capture_id);
  }
  const matches=[];
  for(const id of [...(run.captures??[])].reverse()){
    const value=readCapture(repo,id);if(value.kind==='hr-discovery-feed-v1')continue;
    if(!value.url)continue;
    const sameDomain=domains.has(host(value.url));
    if(!sameDomain&&!feedRaw.has(id)&&!(value.reservation?.candidate_names??[]).some(n=>names.has(n.normalize('NFKC').toLowerCase().trim())))continue;
    const raw=captured(repo,run,id,now);
    matches.push({id,url:raw.url,observed_at:raw.observed_at,fresh:fresh(raw.observed_at,c.freshness.facts,now),
      collection_diagnostic:raw.collection_diagnostic,possibly_truncated:!!raw.possibly_truncated,content_format:raw.content_format,
      candidate_company_page:sameDomain,excerpt_preview:raw.content.slice(0,2000),links_truncated:!!raw.links_truncated,
      board_link_candidates:(raw.links??[]).filter(l=>/^(jobs\.ashbyhq\.com|(?:boards|job-boards)\.greenhouse\.io|jobs\.lever\.co)$/.test(new URL(l.url).hostname))
        .map(l=>({...l,scope:'Exact observed link only; confirm company ownership and inspect each opening separately.'}))});
  }
  return {kind:'hr-inventory-identity-assistance',revision:view.revision,observation_id:observation.id,run:run.run,
    company:groupSummary(group),possible_matches:group.possible_matches.map(id=>view.companies.find(g=>g.id===id)).filter(Boolean).map(groupSummary),
    proposed_website:input.website??null,captures:matches.slice(0,20),matched_captures:matches.length,returned_captures:Math.min(20,matches.length),captures_truncated:matches.length>20,
    confirmation_template:{observation_id:observation.id,run:run.run,website:input.website??null,aliases:[],sources:[],agent_reviewed:false,reason:''},
    required_checks:['Confirm the page identifies this company, not a namesake or an anonymous agency client.',
      'Read existing matches and exclusions; canonical domains and explicit aliases are the only merge keys.',
      'Reuse fresh captures; each confirmation source needs capture_id, excerpt and excerpt_kind.',
      'Use a fresh primary page on every proposed company/alias domain. A supplied website remains an unverified hint.',
      'Observed ATS links support only their stated scope. They do not verify sibling postings, current demand, country eligibility or supplier appetite.'],
    network_reads_allowed:false,prospects_changed:0,send_enabled:false};
}

// Converts explicitly reviewed, capture-backed evidence into the existing
// append-only inventory review. No second identity store or automatic merge.
export async function confirmInventoryIdentity(repo,c,input,{expectedRevision,dryRun=false,now=new Date()}={}){
  keys(input,['observation_id','run','website','aliases','sources','agent_reviewed','reason'],'inventory identity confirmation');
  assert(input.agent_reviewed===true,'Record an agent evidence review before confirming identity; this is not human approval');
  text(input.reason,'Identity review reason',4000);website(input.website);
  assert(Array.isArray(input.aliases)&&input.aliases.length<=20,'Provide at most 20 explicit aliases');
  input.aliases.forEach(website);
  const domains=[host(input.website),...input.aliases.map(host)];
  assert(new Set(domains).size===domains.length,'Repeated identity domain or alias');
  const {run}=context(repo,c,input,now);
  assert(Array.isArray(input.sources)&&input.sources.length>0&&input.sources.length<=20,'Use 1..20 reviewed capture sources');
  const covered=new Set(),evidence=input.sources.map(source=>{
    keys(source,['capture_id','excerpt','excerpt_kind'],'identity capture source');
    const raw=captured(repo,run,source.capture_id,now),d=host(raw.url);
    assert(domains.includes(d),'Identity evidence must come from the proposed company or alias domain');
    assert(raw.content_format==='text'&&raw.collection_diagnostic==='read_ok'&&!raw.possibly_truncated,'Identity requires a readable, nontruncated company-page capture');
    assert(fresh(raw.observed_at,c.freshness.facts,now),'Identity capture is stale; refresh before confirmation');
    assert(['quote','summary'].includes(source.excerpt_kind),'Specify identity excerpt_kind quote or summary');
    const excerpt=text(source.excerpt,'Identity excerpt',4000);
    if(source.excerpt_kind==='quote')assert(raw.content.replace(/\s+/g,' ').includes(excerpt.replace(/\s+/g,' ')),'Identity quote does not occur in the captured page');
    covered.add(d);
    return {id:'identity-'+hash(source.capture_id+'\n'+excerpt).slice(0,24),url:raw.url,observed_at:raw.observed_at,
      source_type:'primary',excerpt_kind:source.excerpt_kind,retrieval_precision:'exact',excerpt};
  });
  assert(domains.every(d=>covered.has(d)),'Every proposed domain and alias requires its own primary capture');
  assert(new Set(evidence.map(e=>e.id)).size===evidence.length,'Repeated identity source excerpt');
  const capture_refs=evidence.map((e,i)=>({evidence_id:e.id,run:run.run,capture_id:input.sources[i].capture_id}));
  return reviewInventory(repo,c,{observation_id:input.observation_id,identity:{website:input.website,aliases:input.aliases,evidence,capture_refs},reason:input.reason},
    {expectedRevision,dryRun,now});
}
