import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import remotive from '../../providers/remotive.mjs';
import hackernews,{parseHnComment} from '../../providers/hackernews.mjs';
import {htmlToText} from '../../providers/_html-to-text.mjs';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {assert,domain,url,hash} from './model.mjs';
import {captureSource,researchBudget,updateRun} from './research-run.mjs';
import {scopeSummary,candidateKey} from './run-scope.mjs';
import {sourceCatalog} from './sources.mjs';
import {discoveryExclusions} from './discovery-context.mjs';

const FEEDS=[
  {id:'remotive',name:'Remotive public jobs',icp:'startup',url:'https://remotive.com/api/remote-jobs',reader:'built-in',request_count:1},
  {id:'hackernews',name:'HN Who is hiring',icp:'startup',url:'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',reader:'built-in',request_count:2},
];
const PROVIDERS={remotive,hackernews},MAX_OBSERVATIONS=200;
export function discoveryFeeds(c){return FEEDS.map(f=>({...f,enabled:c.discovery.feeds?.find(x=>x.id===f.id)?.enabled!==false,
  scope:'Discovery leads only; public-feed support is not a claim of live availability or verified client demand.'}));}
function publicLink(value){try{const link=url(value);assert(!/(^|\.)linkedin\.com$/i.test(new URL(link).hostname),'LinkedIn is not a feed research target');return link;}catch{return null;}}
function exactDate(value){if(typeof value!=='string'&&typeof value!=='number')return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}
function allowedRequest(feed,target){return target===feed.url||(feed.id==='hackernews'&&/^https:\/\/hn\.algolia\.com\/api\/v1\/items\/\d+$/.test(target));}

function observations(feed,payloads,jobs){
  const data=payloads.at(-1).payload,sequence=payloads.at(-1).capture.reservation.sequence;
  const raw=feed.id==='remotive'?data.jobs:data.children;
  assert(Array.isArray(raw),'Invalid feed payload: missing posting array');
  let partial=false;
  const rows=[];
  for(const item of raw){
    if(!item||typeof item!=='object'){partial=true;continue;}
    if(feed.id==='hackernews'&&(item.deleted||item.dead))continue;
    let title,company,location,listing,website,body,id,posted;
    if(feed.id==='remotive'){
      title=item.title;company=item.company_name;location=item.candidate_required_location;
      listing=item.url;website=item.company_website??item.company_url;body=htmlToText(item.description??'',20000);id=item.id;posted=item.publication_date;
    }else{
      const parsed=parseHnComment(item.text,`https://news.ycombinator.com/item?id=${data.id}`);
      if(!parsed){partial=true;continue;}
      title=parsed.title;company=parsed.company;location=parsed.location;
      listing=/^\d+$/.test(String(item.id))?`https://news.ycombinator.com/item?id=${item.id}`:null;
      website=null;body=htmlToText(item.text??'',20000);id=item.id;posted=item.created_at;
    }
    const safeListing=publicLink(listing);
    let safeWebsite=publicLink(website);
    // An aggregator's company-profile URL is not a canonical employer domain.
    if(safeWebsite&&domain(safeWebsite)===domain(feed.url))safeWebsite=null;
    if(typeof title!=='string'||!title.trim()||typeof company!=='string'||!company.trim()||!safeListing){partial=true;continue;}
    rows.push({company:company.trim().slice(0,200),title:title.trim().slice(0,400),location:typeof location==='string'?location.slice(0,1000):null,
      source_url:safeListing,published_website:safeWebsite,description:body,posting_id:id==null?null:String(id).slice(0,200),
      posted_at:exactDate(posted),source_sequence:sequence});
    if(rows.length===MAX_OBSERVATIONS){if(raw.length>rows.length)partial=true;break;}
  }
  if(feed.id==='remotive'&&jobs.length!==raw.length)partial=true;
  if(data.hasMore||data.has_more||data.next||data.nextCursor||data.next_cursor||data.links?.next||data.truncated)partial=true;
  const total=data.total??data['job-count'];if(Number.isFinite(total)&&total!==raw.length)partial=true;
  return {rows,partial,raw_postings:raw.length,retention_limit:MAX_OBSERVATIONS};
}

function leadTasks(repo,c,collected,limit,scope,state){
  const pattern=new RegExp(c.discovery.role_pattern,'i'),records=repo.list(),exclusions=discoveryExclusions(repo),controls=sourceCatalog().controls??[];
  const groups=new Map(),excluded=[];let relevant=0;
  const sitesByName=new Map();
  for(const item of collected.rows)if(item.published_website){const name=candidateKey(item.company);if(!sitesByName.has(name))sitesByName.set(name,new Map());sitesByName.get(name).set(domain(item.published_website),item.published_website);}
  for(const item of collected.rows){
    if(!pattern.test(item.title+' '+item.description))continue;
    relevant++;
    const name=candidateKey(item.company),sites=sitesByName.get(name),conflict=sites?.size>1;
    const website=conflict?null:item.published_website??(sites?.size===1?[...sites.values()][0]:null);
    const websiteDomain=website?domain(website):null;
    const exactDomain=websiteDomain&&exclusions.find(e=>e.domain===websiteDomain||websiteDomain.endsWith('.'+e.domain));
    const named=records.find(p=>candidateKey(p.name)===name);
    const control=controls.find(p=>candidateKey(p.name)===name);
    if(exactDomain||named||control){excluded.push({company:item.company,source_url:item.source_url,reason:exactDomain?.reason??(control?'catalog_control':'possible_existing_name_match'),prospect_id:exactDomain?.prospect_id??named?.id??null,
      needs_identity_review:!exactDomain&&!control});continue;}
    const key=websiteDomain?'domain:'+websiteDomain:'reported-name:'+name;
    if(!groups.has(key))groups.set(key,{name:item.company,website,website_status:conflict?'conflicting_publisher_claims':website?'publisher_asserted_unverified':'unknown',identity_conflict:!!conflict,icp:'unknown',route_hint:'startup',observations:[]});
    const g=groups.get(key);
    if(!g.observations.some(o=>o.source_url===item.source_url&&o.title===item.title))g.observations.push(item);
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
  assert(icp!=='agency','This feed is an employer-discovery source, not verified agency client demand; use discover --plan --icp agency');
  assert(Number.isInteger(limit)&&limit>0&&limit<=c.discovery.max_candidates,'Limit outside configured candidate budget');
  const result={source:feed,requested_icp:icp,run:run??null,needs_agent_research:true,verified_new_prospects:0,qualified_prospects:0,send_enabled:false,requests_spent:0,
    coverage:'This feed covers employer leads only. Agency coverage requires the separate agency plan.',research_tasks:[],diagnostics:[],partial:true};
  if(dryRun)return {...result,network_reads_allowed:false,collection_tasks:[{feed:id,required_directory_requests:feed.request_count}],stopping_reason:'preview_only'};
  assert(run,'--run is required for feed collection');
  const state=researchBudget(repo,c,run),scope=scopeSummary(state);assert(scope,'Configure a scoped run before feed collection');assert(state.status!=='complete','Resume the completed run before collecting or reviewing its feed');
  const requestsSpent=()=>researchBudget(repo,c,run).attempts.length-state.attempts.length;
  let collected,cached=false,collectionInfo;
  for(const captureId of [...(state.captures??[])].reverse()){
    const path=join(repo.dir,'captures',captureId+'.json');if(!existsSync(path))continue;
    const value=JSON.parse(readFileSync(path,'utf8'));
    if(value?.kind==='hr-discovery-feed-v1'&&value.feed_id===id){
      assert(hash(JSON.stringify(value))===captureId,'Cached feed capture hash mismatch; inspect corruption before refreshing');
      assert(Array.isArray(value.collection?.rows)&&value.collection.rows.length<=MAX_OBSERVATIONS,'Invalid cached feed observations');
      assert(value.requests.every(r=>state.attempts.some(a=>a.sequence===r.sequence&&a.target===r.url)&&allowedRequest(feed,r.url)),'Cached feed requests do not match this run');
      if(!refresh){collected=value.collection;collectionInfo=value;cached=true;}
      break;
    }
  }
  if(!collected){
    if(scope.remaining_candidates===0)return {...result,stopping_reason:'candidate_scope_exhausted'};
    const payloads=[];
    const request=async target=>{
      assert(allowedRequest(feed,target),'Unexpected public feed endpoint');
      const captured=await captureSource(repo,c,run,{url:target,company:feed.url,candidate_names:[],directory:true,format:'json',attribution:{source_id:feed.id,icp:feed.icp}},
        {...(fetchText?{fetchText}:{})});
      const payload=JSON.parse(captured.content);payloads.push({capture:captured,payload});return payload;
    };
    try{
      const jobs=await PROVIDERS[id].fetch({}, {fetchJson:request});
      collected=observations(feed,payloads,jobs);
      const saved={kind:'hr-discovery-feed-v1',feed_id:id,observed_at:payloads.at(-1).capture.observed_at,requests:payloads.map(p=>({url:p.capture.url,sequence:p.capture.reservation.sequence,capture_id:p.capture.capture_id})),collection:collected};
      collectionInfo=saved;
      const captureId=hash(JSON.stringify(saved));mkdirSync(join(repo.dir,'captures'),{recursive:true});writeFileAtomic(join(repo.dir,'captures',captureId+'.json'),JSON.stringify(saved,null,2)+'\n');
      await updateRun(repo,c,run,{action:'link',capture:captureId});
      for(const p of payloads)await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:p.capture.reservation.sequence,category:collected.partial?'partial_collection':'read_ok',prospect_ids:[],note:'Public feed response interpreted as unreviewed employer leads only. No qualification, agency-client attribution or complete-market coverage inferred.'}});
    }catch(error){
      for(const p of payloads)await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:p.capture.reservation.sequence,category:'partial_collection',prospect_ids:[],note:'Feed collection incomplete or malformed; missing results never establish an empty board.'}});
      const failed=researchBudget(repo,c,run),last=failed.attempts.at(-1);
      const transport=(failed.outcomes??[]).find(o=>o.sequence===last?.sequence&&['access_restricted','redirect_rejected','http_failure','access_failure'].includes(o.category))?.category;
      return {...result,requests_spent:requestsSpent(),network_reads_allowed:true,stopping_reason:/budget|scope exhausted/i.test(error.message)?'request_budget_exhausted':'source_unresolved',
        diagnostics:[{source:id,error:error.message,collection_diagnostic:transport??'partial_collection'}]};
    }
  }
  const tasks=leadTasks(repo,c,collected,limit,scope,state);
  const newer=state.attempts.filter(a=>a.sequence>Math.max(...collectionInfo.requests.map(r=>r.sequence))&&allowedRequest(feed,a.target));
  return {...result,...tasks,cached,requests_spent:requestsSpent(),raw_postings:collected.raw_postings,retained_observations:collected.rows.length,collection_partial:collected.partial,
    collection_observed_at:collectionInfo.observed_at,collection_requests:collectionInfo.requests,
    newer_unreconciled_attempts:newer.map(a=>({sequence:a.sequence,categories:(state.outcomes??[]).filter(o=>o.sequence===a.sequence).map(o=>o.category)})),
    collection_diagnostic:collected.partial?'partial_collection':collected.raw_postings?'read_ok':'empty_response',
    stopping_reason:collected.partial?'partial_source_collection':tasks.reported_employer_groups>tasks.research_tasks.length?'per_operation_or_candidate_limit':'available_feed_leads_exhausted',
    completion_note:'Reported employer groups and matching text are research tasks, not verified new companies, distinct hires or qualified clients. Cached resumes reapply current exclusions without another request.'};
}
