import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LocalRepository, loadConfig } from './store.mjs';
import { scoreProspect, supported } from './model.mjs';
import { draftCurrent } from './operations.mjs';

export function acceptancePath(root, relative) {
  const base = fs.realpathSync.native(root);
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Use a workspace-relative artifact path');
  const destination = path.resolve(base, relative);
  const inside = target => {const rel=path.relative(base,target);return rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);};
  if (!inside(destination)) throw new Error('Artifact escapes workspace');
  let existing = destination;
  for (;;) {
    try { fs.lstatSync(existing); break; }
    catch (error) { if(error.code!=='ENOENT') throw error; existing=path.dirname(existing); }
  }
  let resolved;
  try { resolved=fs.realpathSync.native(existing); }
  catch { throw new Error('Artifact follows an unresolvable or dangling link'); }
  if (!inside(resolved)) throw new Error('Artifact follows a link outside workspace');
  return destination;
}
export function writeAcceptance(root, relative, value) {
  const target = acceptancePath(root, relative);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(acceptancePath(root,relative), typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n');
  return target;
}
export function testEnvironment(root, env = process.env) {
  const temp = acceptancePath(root, 'local/acceptance/test-temp');
  fs.mkdirSync(temp,{recursive:true});
  return {...env,TEMP:temp,TMP:temp,TMPDIR:temp};
}
export function runAcceptanceTests(root) {
  const files = fs.readdirSync(path.join(root,'tests/hr-ops')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>path.join(root,'tests/hr-ops',n));
  const result = spawnSync(process.execPath,['--test',...files],{cwd:root,env:testEnvironment(root),encoding:'utf8',maxBuffer:32*1024*1024});
  writeAcceptance(root,'local/acceptance/tests.txt',(result.stdout??'')+(result.stderr??''));
  const receipt={exit_code:result.status,error:result.error?.message??null,node:process.version,files:files.length,temp:testEnvironment(root).TEMP};
  writeAcceptance(root,'local/acceptance/tests-exit.json',receipt);
  if (result.error || result.status !== 0) throw new Error('HR tests failed; see local/acceptance/tests.txt');
  return receipt;
}
export function acceptanceSummary(root, now=new Date()) {
  const repo = new LocalRepository(root), c=loadConfig(root);
  const rows=repo.list().map(p=>{
    const s=scoreProspect(p,c,now);
    const us=p.facts.us_market;
    const usFit=us?.value===true && us.confidence==='observed' && !!supported(p,us,c.freshness.facts,now);
    return {id:p.id,name:p.name,icp:p.icp,tier:s.tier,score:s.total,coverage:s.coverage,
      relevant_demand:s.opening_count,us_fit:usFit,blockers:s.blockers,
      us_located_demand:s.us_opening_count,opening_verification_gaps:s.opening_verification_gaps,
      target_match:usFit&&s.opening_count>0&&!s.blockers.length&&!p.suppressed&&!p.hold,
      us_opening_target_match:usFit&&s.us_opening_count>0&&!s.blockers.length&&!p.suppressed&&!p.hold,
      opening_rows:p.openings.length,contacts:p.contacts.length,
      current_drafts:p.drafts.filter(d=>draftCurrent(d,p,c,now)).map(d=>({id:d.id,channel:d.channel,body:d.body,missing:d.missing,review:d.review})),
      draft_chains_valid:p.drafts.every(d=>!d.superseded_by||p.drafts.some(next=>next.id===d.superseded_by)),
      interactions:p.interactions.length};
  });
  return {prospects:rows.length,by_icp:['agency','startup'].map(icp=>({icp,persisted:rows.filter(r=>r.icp===icp).length,
    target_matches:rows.filter(r=>r.icp===icp&&r.target_match).length,
    us_opening_target_matches:rows.filter(r=>r.icp===icp&&r.us_opening_target_match).length})),rows};
}
