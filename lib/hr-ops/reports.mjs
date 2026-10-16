import {existsSync,readFileSync,mkdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {hash,canonical,assert} from './model.mjs';
import {dossier} from './operations.mjs';

function reportPath(repo,id){
  const dir=join(repo.root,'reports'),child=join(dir,'hr-ops'),file=join(child,id+'.md');
  for(const path of [dir,child,file])if(existsSync(path))assert(!lstatSync(path).isSymbolicLink(),'Report path must not be a link');
  return file;
}
function content(p,c,now){
  const body=dossier(p,c,now);
  return {body,metadata:{version:1,prospect_revision:p.revision,configuration_fingerprint:hash(canonical(c)),generated_at:now.toISOString(),content_hash:hash(body)}};
}
// Called after the canonical write while its repository lock is held.
export function publishDossier(repo,p,c,now=new Date()){
  try{
    const file=reportPath(repo,p.id),{body,metadata}=content(p,c,now);
    mkdirSync(join(repo.root,'reports/hr-ops'),{recursive:true});
    writeFileAtomic(file,`<!-- hr-ops-report ${JSON.stringify(metadata)} -->\n${body}`);
    return null;
  }catch(error){return `Canonical record preserved; derived report failed: ${error.message}`;}
}
export function reportStatus(repo,p,c,now=new Date()){
  try{
    const file=reportPath(repo,p.id);
    if(!existsSync(file))return {id:p.id,status:'missing'};
    const saved=readFileSync(file,'utf8'),match=/^<!-- hr-ops-report (.+) -->\r?\n/.exec(saved);
    if(!match)return {id:p.id,status:'stale',reasons:['missing publication metadata']};
    const metadata=JSON.parse(match[1]),current=content(p,c,now).metadata,reasons=[];
    if(metadata.prospect_revision!==p.revision)reasons.push('prospect revision');
    if(metadata.configuration_fingerprint!==current.configuration_fingerprint)reasons.push('configuration');
    if(metadata.content_hash!==current.content_hash)reasons.push('derived content or time freshness');
    if(hash(saved.slice(match[0].length))!==metadata.content_hash)reasons.push('saved content changed');
    return {id:p.id,status:reasons.length?'stale':'current',reasons,...metadata};
  }catch(error){return {id:p.id,status:'error',error:error.message};}
}
export async function refreshReports(repo,c,{now=new Date(),dryRun=false}={}){
  const run=()=>{if(!dryRun)repo.assertWritable();return repo.list().map(p=>dryRun?reportStatus(repo,p,c,now):{id:p.id,report_warning:publishDossier(repo,p,c,now)});};
  return dryRun?run():repo.lock(run);
}
