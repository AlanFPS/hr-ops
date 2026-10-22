import {assert} from './model.mjs';
import {normalizeAshbyJob} from '../../providers/ashby.mjs';

export function parseAgencyAshbyBoard(payload,feed) {
  assert(payload&&payload.apiVersion==='1'&&Array.isArray(payload.jobs),'Unsupported agency Ashby payload; not a verified empty board');
  const board=new URL(feed.board_url),jobs=[];
  let partial=!!(payload.next||payload.nextCursor||payload.next_cursor||payload.hasMore||payload.has_more||payload.truncated||payload.links?.next)||
    ['pagination','offset','page','cursor'].some(key=>Object.hasOwn(payload,key))||
    [payload.total,payload.totalCount].some(total=>total!==undefined&&total!==payload.jobs.length);
  for(const raw of payload.jobs){
    if(!raw||typeof raw!=='object'||raw.isListed!==true){partial=true;continue;}
    try{
      const link=new URL(raw.jobUrl);
      assert(link.origin===board.origin&&link.pathname.startsWith(board.pathname+'/')&&!link.username&&!link.password,'Unexpected agency ATS tenant');
      assert(typeof raw.title==='string'&&raw.title.trim()&&typeof raw.descriptionPlain==='string','Malformed agency posting');
      const normalized=normalizeAshbyJob(raw,feed.company);
      if(typeof raw.id!=='string'||!raw.id.trim()||raw.id.trim().length>200){partial=true;normalized.posting_id=null;}
      else normalized.posting_id=raw.id.trim();
      if(raw.requisition_id!=null&&(typeof raw.requisition_id!=='string'||!raw.requisition_id.trim()||raw.requisition_id.length>200)){
        partial=true;normalized.requisition_id=undefined;
      }
      if(!raw.descriptionPlain.trim()||raw.descriptionPlain.length>20000||raw.title.trim().length>400||normalized.location.length>1000)partial=true;
      jobs.push({...raw,normalized});
    }catch{partial=true;}
  }
  return {jobs,total:payload.jobs.length,partial};
}

// Narrow adapter over the existing bounded visible-text/link capture. Never
// extracts anonymous client names into employer identities or follows links.
export function parseByRecruitingBoard(capture) {
  assert(capture.content_format==='text','Agency board requires a visible text capture');
  assert(/Open Positions/i.test(capture.content)&&/opportunities from our partner companies/i.test(capture.content),
    'Unsupported BY Recruiting board layout or missing client-board attribution');
  const count=capture.content.match(/\b(\d+)\s+open positions\b/i);
  assert(count,'Agency board count missing; completeness unknown');
  const expected=Number(count[1]),jobs=[];
  let malformed=false;
  for(const link of capture.links??[]){
    const target=new URL(link.url);
    if(target.origin!=='https://www.byrecruiting.com'||!/^\/jobs\/\d+$/.test(target.pathname)||target.search)continue;
    const title=link.text.match(/^(.+?)\s+(?:Direct Hire|Full-time|Full Time|Part-time|Contract|Temporary)\b/i)?.[1]?.trim();
    if(!title){malformed=true;continue;}
    jobs.push({id:target.pathname.split('/').at(-1),title,url:target.href,company:'BY Recruiting',
      description:link.text,location:null});
  }
  assert(expected===0||jobs.length>0,'Unsupported agency cards; missing results are not an empty board');
  return {jobs,total:expected,partial:malformed||capture.links_truncated||jobs.length!==expected};
}
