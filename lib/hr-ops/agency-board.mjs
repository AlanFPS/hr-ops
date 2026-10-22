import {assert} from './model.mjs';

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
