// Shared routing contract for retained public readers. No configurable endpoints
// or automatic pagination: each feed keeps a fixed, budgeted request plan.
const FEEDS = [
  {id:'remotive',name:'Remotive public jobs',icp:'startup',url:'https://remotive.com/api/remote-jobs',reader:'built-in',request_count:1},
  {id:'hackernews',name:'HN Who is hiring',icp:'startup',url:'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',reader:'built-in',request_count:2},
  {id:'remoteok',name:'RemoteOK public jobs',icp:'startup',url:'https://remoteok.com/api',reader:'built-in',request_count:1},
  {id:'himalayas',name:'Himalayas public jobs',icp:'startup',url:'https://himalayas.app/jobs/api?limit=50',reader:'built-in',request_count:1},
];
export const DISCOVERY_FEED_IDS = FEEDS.map(f=>f.id);
export function discoveryFeeds(c){return FEEDS.map(f=>({...f,enabled:c.discovery.feeds?.find(x=>x.id===f.id)?.enabled!==false,
  scope:'Discovery leads only; public-feed support is not a claim of live availability or verified client demand.'}));}
export function allowedFeedRequest(feed,target){return target===feed.url||(feed.id==='hackernews'&&/^https:\/\/hn\.algolia\.com\/api\/v1\/items\/\d+$/.test(target));}
export function feedPostingArray(id,payload,index=0){
  if(id==='remoteok')return Array.isArray(payload)?payload:null;
  if(id==='hackernews')return index===0?payload?.hits:payload?.children;
  return payload?.jobs;
}
export function remoteokMetadata(item,index){
  return index===0 && item && typeof item==='object' && !Array.isArray(item) &&
    typeof item.legal==='string' && item.position===undefined && item.company===undefined;
}
