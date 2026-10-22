import {existsSync,lstatSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {assert,hash,keys,stamp,text,url} from './model.mjs';
import {DISCOVERY_FEED_IDS,allowedFeedRequest,feedPostingArray} from './feed-contract.mjs';
import {parseByRecruitingBoard,parseAgencyAshbyBoard} from './agency-board.mjs';

export function assertCaptureDirectory(repo){
  for(const part of ['data','data/hr-ops','data/hr-ops/captures']){
    const path=join(repo.root,part);
    const info=lstatSync(path,{throwIfNoEntry:false});
    if(info)assert(info.isDirectory()&&!info.isSymbolicLink(),'Capture directory must not be a link or non-directory');
  }
}
export function readCapture(repo,id){
  assert(/^[a-f0-9]{64}$/.test(id),'Invalid capture reference');assertCaptureDirectory(repo);
  const path=join(repo.dir,'captures',id+'.json');assert(existsSync(path),'Missing linked research capture '+id);
  const info=lstatSync(path);assert(info.isFile()&&!info.isSymbolicLink(),'Capture file must not be a link');
  const value=JSON.parse(readFileSync(path,'utf8'));
  // Check routing metadata before selecting a feed, so a changed feed/type
  // cannot hide a corrupt cache and cause an implicit fresh request.
  if(value?.feed_id!==undefined||value?.collection?.retention_limit!==undefined||value?.kind==='hr-discovery-feed-v1'){
    assert(hash(JSON.stringify(value))===id,'Cached feed capture hash mismatch; inspect corruption before refreshing');
    assert(value.kind==='hr-discovery-feed-v1'&&DISCOVERY_FEED_IDS.includes(value.feed_id),'Invalid feed capture type or identity');
  }
  return value;
}
export function validateFeedCapture(repo,feed,state,id,value){
  assert(feed&&feed.id===value.feed_id,'Missing or mismatched feed definition');
  assert(hash(JSON.stringify(value))===id,'Cached feed capture hash mismatch; inspect corruption before refreshing');
  keys(value,['kind','feed_id','observed_at','requests','collection'],'feed capture');stamp(value.observed_at);
  assert(Array.isArray(value.requests)&&value.requests.length===feed.request_count,'Invalid cached feed request provenance');
  let previous=0,last,incomplete=false,agencyJobs;
  for(const [index,r] of value.requests.entries()){
    keys(r,['url','sequence','capture_id'],'feed request');
    assert(Number.isSafeInteger(r.sequence)&&r.sequence>previous,'Invalid cached feed request sequence');previous=r.sequence;
    assert(index===0?(feed.id==='speedrun'?allowedFeedRequest(feed,r.url):r.url===feed.url):feed.id==='hackernews'&&r.url!==feed.url&&allowedFeedRequest(feed,r.url),'Cached feed request endpoint mismatch');
    assert(state.attempts.some(a=>a.sequence===r.sequence&&a.kind==='page'&&a.directory===true&&a.target===r.url&&a.attribution?.source_id===feed.id),'Cached feed requests do not match this run');
    assert(state.captures.includes(r.capture_id),'Raw capture is not linked to this research run');
    const raw=readCapture(repo,r.capture_id);
    assert(raw.id===r.capture_id&&raw.url===r.url&&raw.reservation?.sequence===r.sequence&&raw.content_format===(feed.id==='by-recruiting'?'text':'json')&&typeof raw.content==='string','Raw feed capture provenance mismatch');
    assert(hash(JSON.stringify({url:raw.url,observed_at:raw.observed_at,content:raw.content}))===r.capture_id,'Raw feed capture hash mismatch');
    stamp(raw.observed_at);const payload=feed.id==='by-recruiting'?parseByRecruitingBoard(raw):feed.id==='bedrock-talent'?parseAgencyAshbyBoard(JSON.parse(raw.content),feed):JSON.parse(raw.content);
    if(feed.icp==='agency')agencyJobs=payload.jobs;
    assert(Array.isArray(feedPostingArray(feed.id,payload,index)),'Invalid raw feed payload');
    if(feed.id==='hackernews'&&index===1)assert(String(payload.id)===r.url.split('/').at(-1),'Raw HN capture does not match the requested hiring story');
    incomplete||=raw.possibly_truncated||raw.collection_diagnostic!=='read_ok';last=raw;
  }
  assert(value.observed_at===last.observed_at,'Feed observation time differs from its raw capture');
  const c=value.collection;keys(c,['rows','partial','raw_postings','retention_limit'],'feed collection');
  assert(Array.isArray(c.rows)&&c.rows.length<=200&&c.retention_limit===200&&typeof c.partial==='boolean'&&Number.isSafeInteger(c.raw_postings)&&c.raw_postings>=c.rows.length,'Invalid cached feed observations');
  for(const row of c.rows){
    text(row.company,'Observed employer',200);text(row.title,'Observed title',400);url(row.source_url);
    assert(row.source_sequence===last.reservation.sequence,'Observation source sequence differs from its raw capture');
    assert(row.location===null||typeof row.location==='string'&&row.location.length<=1000,'Invalid observed location');
    assert(typeof row.description==='string'&&row.description.length<=20000,'Invalid observed description');
    assert(row.posting_id===null||typeof row.posting_id==='string'&&row.posting_id.length<=200,'Invalid observed posting identity');
    if(row.published_website!==null)url(row.published_website);
    if(row.posted_at!==null)stamp(row.posted_at);
    if(feed.id==='by-recruiting')assert(agencyJobs.some(j=>j.url===row.source_url&&j.title===row.title&&j.id===row.posting_id&&j.description===row.description),
      'Agency observation differs from its visible link capture');
    const matchingAgency=feed.id==='bedrock-talent'?agencyJobs.filter(j=>url(j.normalized.url)===row.source_url&&j.normalized.title.trim().slice(0,400)===row.title&&(j.normalized.posting_id??null)===row.posting_id&&
      j.normalized.description.slice(0,20000)===row.description&&(j.normalized.location.slice(0,1000)||null)===row.location&&row.company===feed.company&&row.published_website===url(feed.website)):[];
    if(feed.id==='bedrock-talent')assert(matchingAgency.length&&row.provider_metadata,'Agency observation differs from its public ATS capture or lacks metadata');
    if(row.provider_metadata!==undefined){
      const allowed=feed.id==='speedrun'?['company_slug','company_profile_url','reported_size','reported_stage','workplace_type','portfolio_tier']:
        feed.id==='by-recruiting'?['hiring_for','client_identity','supplier_appetite']:
          feed.id==='bedrock-talent'?['hiring_for','client_identity','supplier_appetite','provider','board_url','requisition_id','workplace_type']:[];
      keys(row.provider_metadata,allowed,'feed provider metadata');
      for(const value of Object.values(row.provider_metadata))assert(value===null||typeof value==='string'&&value.length<=1000,'Invalid feed provider metadata');
      if(row.provider_metadata.company_profile_url!==undefined&&row.provider_metadata.company_profile_url!==null)url(row.provider_metadata.company_profile_url);
      if(feed.id==='bedrock-talent'){
        const m=row.provider_metadata;
        assert(m.hiring_for==='unreviewed'&&m.client_identity==='unknown'&&m.supplier_appetite==='unknown'&&m.provider==='ashby'&&m.board_url===feed.board_url&&
          matchingAgency.some(j=>m.requisition_id===(j.normalized.requisition_id??null)&&m.workplace_type===(typeof j.workplaceType==='string'?j.workplaceType.slice(0,1000):null)),'Agency metadata differs from its raw capture');
      }
    }
  }
  // Older caches may predate propagation of raw truncation diagnostics. Correct
  // the current view without rewriting the original capture or its hash.
  return {...value,collection:{...c,partial:c.partial||incomplete}};
}
