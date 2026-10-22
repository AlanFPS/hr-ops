// Shared routing contract for retained public readers. No configurable endpoints
// or automatic pagination: each feed keeps a fixed, budgeted request plan.
const SPEEDRUN_FILTERS=['q','scope','fn','wp','size','stage','portfolio'];
export function validateFeedFilters(id,filters){
  if(filters===undefined)return;
  if(id!=='speedrun'||!filters||typeof filters!=='object'||Array.isArray(filters))throw Error('filters are supported only for speedrun');
  for(const [key,value] of Object.entries(filters)){
    if(!SPEEDRUN_FILTERS.includes(key))throw Error('Unknown Speedrun filter '+key);
    if(typeof value!=='string'||!value.trim()||value.length>120)throw Error('Invalid Speedrun filter '+key);
    if(key==='scope'&&!['speedrun','portfolio','everywhere'].includes(value))throw Error('Invalid Speedrun scope');
  }
}
function speedrunUrl(filters={}){
  validateFeedFilters('speedrun',filters);
  const query=new URLSearchParams({page:'0',source:'hr-ops',scope:filters.scope??'portfolio'});
  for(const key of SPEEDRUN_FILTERS)if(key!=='scope'&&filters[key]!==undefined)query.set(key,filters[key]);
  return 'https://speedrun-talent-network.com/api/v1/jobs?'+query;
}
const FEEDS = [
  {id:'remotive',name:'Remotive public jobs',icp:'startup',url:'https://remotive.com/api/remote-jobs',reader:'built-in',request_count:1},
  {id:'hackernews',name:'HN Who is hiring',icp:'startup',url:'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',reader:'built-in',request_count:2},
  {id:'remoteok',name:'RemoteOK public jobs',icp:'startup',url:'https://remoteok.com/api',reader:'built-in',request_count:1},
  {id:'himalayas',name:'Himalayas public jobs',icp:'startup',url:'https://himalayas.app/jobs/api?limit=50',reader:'built-in',request_count:1},
  {id:'speedrun',name:'Speedrun public portfolio jobs',icp:'startup',url:speedrunUrl(),reader:'built-in',request_count:1},
  {id:'by-recruiting',name:'BY Recruiting client opportunities',icp:'agency',hiring_for:'client',website:'https://www.byrecruiting.com',url:'https://www.byrecruiting.com/careers',reader:'built-in',request_count:1},
  {id:'bedrock-talent',name:'Bedrock Talent published opportunities',company:'Bedrock Talent',icp:'agency',hiring_for:'client',website:'https://bedrocktalent.io',board_url:'https://jobs.ashbyhq.com/bedrock-talent',url:'https://api.ashbyhq.com/posting-api/job-board/bedrock-talent',reader:'built-in',provider:'ashby',request_count:1},
];
export const DISCOVERY_FEED_IDS = FEEDS.map(f=>f.id);
function agencyEnabled(c,feed){
  const host=value=>new URL(value).hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
  const override=c.discovery.sources.filter(s=>{try{return host(s.website)===host(feed.website);}catch{return false;}}).at(-1);
  return override?.enabled!==false;
}
export function discoveryFeeds(c){return FEEDS.map(f=>({...f,...(f.id==='speedrun'?{url:speedrunUrl(c.discovery.feeds?.find(x=>x.id===f.id)?.filters)}:{}),enabled:c.discovery.feeds?.find(x=>x.id===f.id)?.enabled!==false&&
  (f.icp!=='agency'||agencyEnabled(c,f)),
  scope:'Discovery leads only; public-feed support is not a claim of live availability or verified client demand.'}));}
export function allowedFeedRequest(feed,target){
  if(feed.id==='speedrun')try{
    const u=new URL(target),params=Object.fromEntries(u.searchParams),filters=Object.fromEntries(SPEEDRUN_FILTERS.filter(k=>params[k]!==undefined).map(k=>[k,params[k]]));
    return target===speedrunUrl(filters);
  }catch{return false;}
  return target===feed.url||(feed.id==='hackernews'&&/^https:\/\/hn\.algolia\.com\/api\/v1\/items\/\d+$/.test(target));
}
export function feedPostingArray(id,payload,index=0){
  if(id==='remoteok')return Array.isArray(payload)?payload:null;
  if(id==='hackernews')return index===0?payload?.hits:payload?.children;
  return payload?.jobs;
}
export function remoteokMetadata(item,index){
  return index===0 && item && typeof item==='object' && !Array.isArray(item) &&
    typeof item.legal==='string' && item.position===undefined && item.company===undefined;
}
