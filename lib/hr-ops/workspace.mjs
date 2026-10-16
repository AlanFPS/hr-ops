import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assert,keys,text,stamp,validateConfig,mergeConfig,DEFAULTS} from './model.mjs';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {readInbox} from './inbox-state.mjs';

export const workspacePath=repo=>join(repo.dir,'workspace.json');
function accountUrl(value,page=false){
 if(value===null)return null;const u=new URL(value);
 assert(u.origin==='https://www.linkedin.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&(page?/^\/company\/[a-zA-Z0-9_-]+\/?$/:/^\/in\/[a-zA-Z0-9_-]+\/?$/).test(u.pathname),'Exact LinkedIn '+(page?'company':'profile')+' URL required');
 return u.origin+u.pathname.replace(/\/$/,'');
}
export function validateWorkspace(w){
 keys(w,['version','id','name','purpose','linkedin_profile_url','linkedin_page_url','created_at','updated_at'],'workspace');
 assert(w.version===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(w.id),'Invalid workspace identity');text(w.name,'workspace name',100);
 assert(['experimental','operating'].includes(w.purpose),'Workspace purpose must be experimental or operating');
 assert(accountUrl(w.linkedin_profile_url)===w.linkedin_profile_url,'Noncanonical workspace account');assert(accountUrl(w.linkedin_page_url,true)===w.linkedin_page_url,'Noncanonical branding Page');stamp(w.created_at);stamp(w.updated_at);return w;
}
export function readWorkspace(repo){const file=workspacePath(repo);if(!existsSync(file))return null;assert(!lstatSync(file).isSymbolicLink(),'Workspace identity must not be a link');return validateWorkspace(JSON.parse(readFileSync(file,'utf8')));}
export function requireWorkspaceAccount(repo,sender){
 const w=readWorkspace(repo);assert(w?.linkedin_profile_url,'Configure this workspace and its LinkedIn profile before browser operations');
 assert(accountUrl(sender)===w.linkedin_profile_url,'Requested LinkedIn account differs from configured workspace');return w;
}
export function workspaceBrowserPath(repo){
 const target=join(repo.root,'local/browser-profiles/hr-ops-linkedin');
 for(let cursor=target;cursor!==repo.root;cursor=dirname(cursor))if(existsSync(cursor))assert(!lstatSync(cursor).isSymbolicLink(),'Workspace browser path must not be a link');
 return target;
}
export async function configureWorkspace(repo,input,{dryRun=false}={}){
 keys(input,['name','purpose','linkedin_profile_url','linkedin_page_url'],'workspace input');
 const perform=()=>{const old=readWorkspace(repo),now=new Date().toISOString();
 const w=validateWorkspace({...old,version:1,id:old?.id??randomUUID(),name:input.name??old?.name,purpose:input.purpose??old?.purpose,
 linkedin_profile_url:input.linkedin_profile_url===undefined?old?.linkedin_profile_url??null:accountUrl(input.linkedin_profile_url),
 linkedin_page_url:input.linkedin_page_url===undefined?old?.linkedin_page_url??null:accountUrl(input.linkedin_page_url,true),created_at:old?.created_at??now,updated_at:now});
 const inbox=readInbox(repo),accounts=new Set(Object.values(inbox.runs).map(r=>r.sender_profile_url));
 const attempts=join(repo.dir,'delivery-attempts');if(existsSync(attempts))for(const file of readdirSync(attempts).filter(f=>f.endsWith('.json'))){const a=JSON.parse(readFileSync(join(attempts,file),'utf8'));if(a.plan?.sender_profile_url)accounts.add(a.plan.sender_profile_url);}
 for(const p of repo.list())for(const e of p.interactions)if(e.origin?.sender_profile_url)accounts.add(e.origin.sender_profile_url);
 assert(!accounts.size||(accounts.size===1&&accounts.has(w.linkedin_profile_url)),'Existing account history requires a separate workspace to change accounts');
 if(!dryRun){repo.assertWritable();writeFileAtomic(workspacePath(repo),JSON.stringify(w,null,2)+'\n');}return {workspace:w,dry_run:dryRun};};
 return dryRun?perform():repo.lock(perform);
}
export async function createWorkspace(destination,input,{dryRun=false}={}){
 assert(typeof destination==='string'&&isAbsolute(destination),'Explicit absolute workspace destination required');
 keys(input,['name','purpose','linkedin_profile_url','linkedin_page_url','config','preferences'],'new workspace input');
 const root=resolve(destination);let cursor=root;while(true){if(existsSync(cursor))assert(!lstatSync(cursor).isSymbolicLink(),'Workspace destination or ancestor is a link');if(dirname(cursor)===cursor)break;cursor=dirname(cursor);}
 assert(!existsSync(root)||(lstatSync(root).isDirectory()&&readdirSync(root).length===0),'Workspace destination must be new or empty');
 const config=validateConfig(mergeConfig(DEFAULTS,input.config??{}));
 if(input.preferences!==undefined)assert(typeof input.preferences==='string'&&input.preferences.length<=20000,'Preferences must be text up to 20000 characters');
 const {LocalRepository,initialize}=await import('./store.mjs');const repo=new LocalRepository(root);
 const identity=Object.fromEntries(Object.entries(input).filter(([k])=>!['config','preferences'].includes(k)));
 const preview=await configureWorkspace(repo,identity,{dryRun:true});if(dryRun)return {...preview,root,selected:false};
 mkdirSync(root,{recursive:true});const claim=join(root,'.hr-ops-create.lock');writeFileSync(claim,'Creating HR-Ops workspace\n',{flag:'wx'});
 try{assert(readdirSync(root).every(f=>f==='.hr-ops-create.lock'),'Destination changed during creation');await initialize(root,config);
 if(input.preferences!==undefined){mkdirSync(join(root,'modes'),{recursive:true});writeFileAtomic(join(root,'modes/_custom.md'),input.preferences);}
 const result=await configureWorkspace(repo,identity);return {...result,root,selected:false};
 }finally{unlinkSync(claim);}
}
