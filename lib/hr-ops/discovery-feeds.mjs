import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import remotive from '../../providers/remotive.mjs';
import hackernews,{parseHnComment} from '../../providers/hackernews.mjs';
import remoteok from '../../providers/remoteok.mjs';
import himalayas,{parseHimalayasResponse} from '../../providers/himalayas.mjs';
import {fetchSpeedrunPage,normalizeSpeedrunJob} from '../../providers/a16z-speedrun-talent.mjs';
import {parseByRecruitingBoard} from './agency-board.mjs';
import {htmlToText} from '../../providers/_html-to-text.mjs';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {assert,domain,url,hash,stamp,validDay} from './model.mjs';
import {captureSource,researchBudget,updateRun,ResearchBudgetError} from './research-run.mjs';
import {scopeSummary,candidateKey} from './run-scope.mjs';
import {sourceCatalog} from './sources.mjs';
import {discoveryExclusions,websiteExclusion} from './discovery-context.mjs';
import {failureCategory} from './research-outcomes.mjs';
import {fetchTextHead} from '../../providers/_http.mjs';
import {assertCaptureDirectory,readCapture,validateFeedCapture} from './feed-captures.mjs';
import {discoveryFeeds,allowedFeedRequest,feedPostingArray,remoteokMetadata} from './feed-contract.mjs';
import {linkFeedInventory,readInventory} from './inventory.mjs';
export {discoveryFeeds} from './feed-contract.mjs';

const PROVIDERS={remotive,hackernews,remoteok,himalayas},MAX_OBSERVATIONS=200;
function publicLink(value){try{const link=url(value);assert(!/(^|\.)linkedin\.com$/i.test(new URL(link).hostname.replace(/\.$/,'')),'LinkedIn is not a feed research target');return link;}catch{return null;}}
function publication(value,observedAt,epochSeconds=false){
  const reported=value===undefined||value===null?null:String(value).slice(0,200);
  try{
    let parsed=value;
    if(epochSeconds&&typeof value==='number'){
      assert(Number.isSafeInteger(value)&&value>0,'Invalid epoch seconds');
      parsed=new Date(value*1000).toISOString();
    }
    assert(typeof parsed==='string','Publication date must be explicit text');
    const day=/^\d{4}-\d{2}-\d{2}$/.test(parsed),at=day?validDay(parsed)+'T00:00:00Z':parsed;
    return {posted_at:stamp(at,new Date(observedAt)),reported_posted_at:reported,posted_at_status:'parsed_unreviewed',posted_at_precision:day?'day':'instant'};
  }catch{return {posted_at:null,reported_posted_at:reported,posted_at_status:reported===null?'unknown':'unresolved',posted_at_precision:null};}
}

function observations(feed,payloads,jobs){
  const data=payloads.at(-1).payload,sequence=payloads.at(-1).capture.reservation.sequence;
  if(feed.id==='speedrun'&&data.scope!==undefined)assert(data.scope===new URL(feed.url).searchParams.get('scope'),'Speedrun response scope does not match the requested scope');
  const raw=feedPostingArray(feed.id,data,payloads.length-1);
  assert(Array.isArray(raw),'Invalid feed payload: missing posting array');
  if(feed.id==='hackernews')assert(String(data.id)===payloads.at(-1).capture.url.split('/').at(-1),'HN thread payload does not match the requested hiring story');
  let partial=payloads.some(p=>p.capture.possibly_truncated||p.capture.collection_diagnostic!=='read_ok');
  const rows=[];let metadataRows=0;
  for(const [index,item] of raw.entries()){
    if(feed.id==='remoteok'&&remoteokMetadata(item,index)){metadataRows++;continue;}
    if(!item||typeof item!=='object'){partial=true;continue;}
    if(feed.id==='hackernews'&&(item.deleted||item.dead))continue;
    let title,company,location,listing,website,body,id,posted,description,metadata;
    if(feed.id==='remotive'){
      title=item.title;company=item.company_name;location=item.candidate_required_location;
      listing=item.url;website=item.company_website??item.company_url;description=item.description;id=item.id;posted=item.publication_date;
    }else if(feed.id==='remoteok'){
      title=item.position;company=item.company;location=item.location;listing=item.url;
      website=item.company_website??item.company_url;description=item.description;id=item.id;posted=item.date??item.epoch;
    }else if(feed.id==='himalayas'){
      const normalized=parseHimalayasResponse({jobs:[item]})[0];
      if(!normalized){partial=true;continue;}
      title=normalized.title;company=item.companyName;listing=normalized.url;
      const locations=item.locationRestrictions;
      if(!Array.isArray(locations)||locations.some(x=>typeof x!=='string'))partial=true;
      location=Array.isArray(locations)?locations.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()).join(', ')||null:null;
      website=item.companyWebsite;description=item.description;id=item.id??item.guid;posted=item.pubDate;
    }else if(feed.id==='speedrun'){
      const normalized=normalizeSpeedrunJob(item);
      if(!normalized){partial=true;continue;}
      if(item.status==='closed'){partial=true;continue;}
      // Masked companies stay masked and are not acquisition identities.
      if(item.stealth===true||/^stealth(?:\b|$)/i.test(item.company??''))continue;
      if(typeof item.company!=='string'||!item.company.trim()){partial=true;continue;}
      title=normalized.title;company=item.company;location=normalized.location||null;
      listing=normalized.url;website=null;description=item.description??'';id=item.id;posted=item.published_at;
      const observed=key=>typeof item[key]==='string'?item[key].slice(0,1000):null;
      metadata={company_slug:observed('company_slug'),company_profile_url:publicLink(item.company_url),
        reported_size:observed('company_size')??observed('size'),reported_stage:observed('company_stage')??observed('stage'),
        workplace_type:observed('workplace_type'),portfolio_tier:observed('tier')};
    }else if(feed.id==='by-recruiting'){
      title=item.title;company=feed.name.replace(' client opportunities','');location=null;
      listing=item.url;website=feed.website;description=item.description;id=item.id;posted=null;
      metadata={hiring_for:'unreviewed',client_identity:'unknown',supplier_appetite:'unknown'};
    }else{
      const parsed=parseHnComment(item.text,`https://news.ycombinator.com/item?id=${data.id}`);
      if(!parsed){partial=true;continue;}
      title=parsed.title;company=parsed.company;location=parsed.location;
      listing=/^\d+$/.test(String(item.id))?`https://news.ycombinator.com/item?id=${item.id}`:null;
      website=null;description=item.text;id=item.id;posted=item.created_at;
    }
    body=feed.id==='by-recruiting'?description:htmlToText(typeof description==='string'?description:'',20000);
    const safeListing=publicLink(listing);
    let safeWebsite=publicLink(website);
    // An aggregator's company-profile URL is not a canonical employer domain.
    if(feed.icp!=='agency'&&safeWebsite&&websiteExclusion([{domain:domain(feed.url)}],safeWebsite))safeWebsite=null;
    if(typeof title!=='string'||!title.trim()||typeof company!=='string'||!company.trim()||!safeListing){partial=true;continue;}
    if(typeof description!=='string')partial=true;
    const postingId=typeof id==='string'&&id.trim()?id.trim().slice(0,200):Number.isSafeInteger(id)&&id>=0?String(id):null;
    if(id!=null&&postingId===null)partial=true;
    rows.push({company:company.trim().slice(0,200),title:title.trim().slice(0,400),location:typeof location==='string'?location.slice(0,1000):null,
      source_url:safeListing,published_website:safeWebsite,description:body,posting_id:postingId,
      ...(metadata?{provider_metadata:metadata}:{}),
      ...publication(posted,payloads.at(-1).capture.observed_at,['remoteok','himalayas'].includes(feed.id)),source_sequence:sequence});
    if(rows.length===MAX_OBSERVATIONS){if(index<raw.length-1)partial=true;break;}
  }
  const rawPostings=raw.length-metadataRows;
  if(feed.id!=='hackernews'&&jobs.length!==rawPostings)partial=true;
  if(data.hasMore||data.has_more||data.next||data.nextCursor||data.next_cursor||data.links?.next||data.truncated)partial=true;
  const total=data.totalCount??data.total??data['job-count'];if(Number.isFinite(total)&&total!==rawPostings)partial=true;
  if(feed.id==='himalayas'&&(!Number.isSafeInteger(total)||total<0||raw.length>=50||Number(data.offset??0)!==0))partial=true;
  if(feed.id==='by-recruiting'&&data.partial)partial=true;
  if(feed.id==='speedrun'){
    if(data.page!==0||data.page_size!==50||!Number.isSafeInteger(data.total)||data.total<0||
      !Number.isSafeInteger(data.total_pages)||data.total_pages!==Math.ceil(data.total/50)||
      raw.length!==Math.min(50,data.total)||data.total_pages>1||
      !data.facets||typeof data.facets!=='object'||Array.isArray(data.facets))partial=true;
  }
  return {rows,partial,raw_postings:rawPostings,retention_limit:MAX_OBSERVATIONS};
}

function leadTasks(repo,c,collected,limit,scope,state,feed){
  const pattern=new RegExp(c.discovery.role_pattern,'i'),records=repo.list(),exclusions=discoveryExclusions(repo),controls=sourceCatalog().controls??[];
  const groups=new Map(),excluded=[];let relevant=0;
  const sitesByName=new Map();
  for(const item of collected.rows)if(item.published_website){const name=candidateKey(item.company);if(!sitesByName.has(name))sitesByName.set(name,new Map());sitesByName.get(name).set(domain(item.published_website),item.published_website);}
  for(const item of collected.rows){
    const roleTitle=feed.id==='hackernews'?item.title.split('|')[1]?.trim()??item.title:item.title;
    if(!pattern.test(roleTitle))continue;
    relevant++;
    const name=candidateKey(item.company),sites=sitesByName.get(name),conflict=sites?.size>1;
    const website=conflict?null:item.published_website??(sites?.size===1?[...sites.values()][0]:null);
    const websiteDomain=website?domain(website):null;
    const assertedWebsite=item.published_website??website;
    const exactDomain=assertedWebsite&&websiteExclusion(exclusions,assertedWebsite);
    const named=records.find(p=>candidateKey(p.name)===name);
    const control=controls.find(p=>candidateKey(p.name)===name);
    if(exactDomain||named||control){if(feed.icp==='agency'&&excluded.some(e=>e.company===item.company))continue;excluded.push({company:item.company,source_url:item.source_url,reason:exactDomain?.reason??(control?'catalog_control':'possible_existing_name_match'),prospect_id:exactDomain?.prospect_id??named?.id??null,
      ...(feed.icp==='agency'?{refresh_instruction:'Review captured role links with research/status on this existing agency; do not create anonymous client prospects.',observations:collected.rows.filter(row=>pattern.test(row.title))}:{}),
      needs_identity_review:!exactDomain&&!control});continue;}
    const key=websiteDomain?'domain:'+websiteDomain:'reported-name:'+name;
    if(!groups.has(key))groups.set(key,{name:item.company,website,website_status:conflict?'conflicting_publisher_claims':website?'publisher_asserted_unverified':'unknown',identity_conflict:!!conflict,icp:'unknown',route_hint:feed.icp,observations:[]});
    const g=groups.get(key);
    if(!g.observations.some(o=>hash(o)===hash(item)))g.observations.push(item);
  }
  const selected=[];let newNames=0;
  for(const g of groups.values()){
    g.already_admitted=scope.candidates.some(n=>candidateKey(n)===candidateKey(g.name));
    if(!g.already_admitted&&newNames>=scope.remaining_candidates)continue;
    selected.push(g);if(!g.already_admitted)newNames++;if(selected.length===limit)break;
  }
  return {research_tasks:selected.map(g=>({...g,requires_identity_verification:true,requires_role_review:true,
    checks:['Verify canonical employer and official company-to-board ownership','Confirm startup versus recruiting agency; distinguish client placements from internal hiring','Read current role body and country/engagement scope','Verify US market, size, service fit, restrictions and relevant contacts'],
    admission:g.identity_conflict?null:g.already_admitted?state.candidate_origins?.find(o=>candidateKey(o.name)===candidateKey(g.name))??null:
      {name:g.name,source_url:g.observations[0].source_url,source_sequence:g.observations[0].source_sequence}})),
    excluded,relevant_posting_observations:relevant,reported_employer_groups:groups.size};
}

export async function collectDiscoveryFeed(repo,c,{id,run,limit=c.discovery.limit,icp='both',dryRun=false,refresh=false,fetchText,now=new Date()}={}){
  assert(['both','startup','agency'].includes(icp),'Invalid ICP');
  const feed=discoveryFeeds(c).find(f=>f.id===id);assert(feed,'Unknown discovery feed');assert(feed.enabled,'Discovery feed disabled by user configuration');
  assert(icp==='both'||icp===feed.icp,'This feed does not cover the requested ICP; employer feeds are not verified agency client demand');
  assert(Number.isInteger(limit)&&limit>0&&limit<=c.discovery.max_candidates,'Limit outside configured candidate budget');
  const result={source:feed,requested_icp:icp,run:run??null,needs_agent_research:true,verified_new_prospects:0,qualified_prospects:0,send_enabled:false,requests_spent:0,
    coverage:feed.icp==='agency'?'One published agency board; role bodies, individual client attribution and supplier appetite still require review.':'This feed covers employer leads only. Agency coverage requires the separate agency plan.',research_tasks:[],diagnostics:[],partial:true};
  if(dryRun)return {...result,network_reads_allowed:false,collection_tasks:[{feed:id,required_directory_requests:feed.request_count}],stopping_reason:'preview_only'};
  assert(run,'--run is required for feed collection');
  const state=researchBudget(repo,c,run),scope=scopeSummary(state);assert(scope,'Configure a scoped run before feed collection');assert(state.status!=='complete','Resume the completed run before collecting or reviewing its feed');
  readInventory(repo); // Fail before dispatch rather than overwriting/ignoring corrupt intake state.
  assertCaptureDirectory(repo);
  let requestsSpent=0,transportFailure=null;
  const transport=async(target,options)=>{requestsSpent++;try{return await (fetchText??fetchTextHead)(target,options);}catch(error){transportFailure=failureCategory(error);throw error;}};
  let collected,cached=false,collectionInfo;
  for(const captureId of [...(state.captures??[])].reverse()){
    const value=readCapture(repo,captureId);
    if(value?.kind==='hr-discovery-feed-v1'&&value.feed_id===id){
      const validated=validateFeedCapture(repo,feed,state,captureId,value);
      if(value.requests[0].url!==feed.url)continue; // Other explicit filter combinations have separate cached responses.
      if(!refresh){collected=validated.collection;collectionInfo=value;cached=true;}
      break;
    }
  }
  if(!collected){
    if(scope.remaining_candidates===0)return {...result,stopping_reason:'candidate_scope_exhausted'};
    const payloads=[];
    const request=async target=>{
      assert(allowedFeedRequest(feed,target),'Unexpected public feed endpoint');
      if(scopeSummary(researchBudget(repo,c,run)).remaining_candidates===0){const error=new ResearchBudgetError('candidate',null);error.code='HR_OPS_CANDIDATE_SCOPE_EXHAUSTED';throw error;}
      const captured=await captureSource(repo,c,run,{url:target,company:feed.website??feed.url,candidate_names:[],directory:true,format:id==='by-recruiting'?'text':'json',attribution:{source_id:feed.id,icp:feed.icp}},
        {fetchText:transport});
      let payload;
      try{payload=id==='by-recruiting'?parseByRecruitingBoard(captured):JSON.parse(captured.content);}
      catch(error){await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:captured.reservation.sequence,category:'partial_collection',prospect_ids:[],note:'Reader could not interpret the captured payload; a readable page is not a verified vacancy board.'}});throw error;}
      payloads.push({capture:captured,payload});return payload;
    };
    try{
      const jobs=id==='speedrun'?(await fetchSpeedrunPage({fetchJson:request},feed.url)).jobs:
        id==='by-recruiting'?(await request(feed.url)).jobs:await PROVIDERS[id].fetch({}, {fetchJson:request});
      collected=observations(feed,payloads,jobs);
      const saved={kind:'hr-discovery-feed-v1',feed_id:id,observed_at:payloads.at(-1).capture.observed_at,requests:payloads.map(p=>({url:p.capture.url,sequence:p.capture.reservation.sequence,capture_id:p.capture.capture_id})),collection:collected};
      collectionInfo=saved;
      const captureId=hash(JSON.stringify(saved));mkdirSync(join(repo.dir,'captures'),{recursive:true});writeFileAtomic(join(repo.dir,'captures',captureId+'.json'),JSON.stringify(saved,null,2)+'\n');
      await updateRun(repo,c,run,{action:'link',capture:captureId});
      for(const p of payloads)await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:p.capture.reservation.sequence,category:collected.partial?'partial_collection':'read_ok',prospect_ids:[],note:'Public feed response interpreted as unreviewed employer leads only. No qualification, agency-client attribution or complete-market coverage inferred.'}});
    }catch(error){
      for(const p of payloads)await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:p.capture.reservation.sequence,category:'partial_collection',prospect_ids:[],note:'Feed collection incomplete or malformed; missing results never establish an empty board.'}});
      return {...result,requests_spent:requestsSpent,network_reads_allowed:true,stopping_reason:error.code==='HR_OPS_CANDIDATE_SCOPE_EXHAUSTED'?'candidate_scope_exhausted':error.code==='HR_OPS_BUDGET_EXHAUSTED'?'request_budget_exhausted':'source_unresolved',
        diagnostics:[{source:id,error:error.message,collection_diagnostic:transportFailure??(error.message.startsWith('Host access is restricted')?'access_restricted':'partial_collection')}]};
    }
  }
  const current=researchBudget(repo,c,run),currentScope=scopeSummary(current);
  const tasks=leadTasks(repo,c,collected,limit,currentScope,current,feed);
  const newer=current.attempts.filter(a=>a.sequence>Math.max(...collectionInfo.requests.map(r=>r.sequence))&&(id==='speedrun'?a.target===feed.url:allowedFeedRequest(feed,a.target)));
  return linkFeedInventory(repo,c,{...result,...tasks,cached,requests_spent:requestsSpent,remaining_candidate_slots:currentScope.remaining_candidates,raw_postings:collected.raw_postings,retained_observations:collected.rows.length,collection_partial:collected.partial,
    collection_capture_id:hash(JSON.stringify(collectionInfo)),
    collection_scope:['himalayas','speedrun'].includes(id)?'first public page only':id==='remoteok'?'publisher latest-postings window':id==='by-recruiting'?'one official agency board; linked role bodies unreviewed':'configured feed response',
    ...(id==='speedrun'?{query_filters:Object.fromEntries(new URL(feed.url).searchParams),facets_capture_id:collectionInfo.requests[0].capture_id,
      caveats:['Facet labels are publisher classifications, not verified company facts.','Portfolio talent support may reduce incremental service fit; supplier appetite remains unknown.','Masked companies are excluded; no attempt is made to identify them.']}:{}),
    collection_observed_at:collectionInfo.observed_at,collection_requests:collectionInfo.requests,
    newer_unreconciled_attempts:newer.map(a=>({sequence:a.sequence,categories:(current.outcomes??[]).filter(o=>o.sequence===a.sequence).map(o=>o.category)})),
    collection_diagnostic:collected.partial?'partial_collection':collected.raw_postings?'read_ok':'empty_response',
    stopping_reason:collected.partial?'partial_source_collection':tasks.reported_employer_groups>tasks.research_tasks.length?'per_operation_or_candidate_limit':'available_feed_leads_exhausted',
    completion_note:'Reported employer groups and matching text are research tasks, not verified new companies, distinct hires or qualified clients. Cached resumes reapply current exclusions without another request.'},now);
}
