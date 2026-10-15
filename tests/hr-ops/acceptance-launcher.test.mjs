import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const launcher=fileURLToPath(new URL('../../scripts/hr-ops-acceptance.ps1',import.meta.url));
for(const client of ['codex','claude']) for(const exit of [0,7]) {
  test(`Windows launcher preserves ${client} exit ${exit}, stderr warnings and UTF-8`,{skip:process.platform!=='win32'},t=>{
    const root=mkdtempSync(join(tmpdir(),'hr launcher '));
    t.after(()=>rmSync(root,{recursive:true,force:true}));
    const workspace=join(root,'workspace'),bin=join(root,'bin'); mkdirSync(workspace);mkdirSync(bin);
    const alias=join(root,'workspace-alias');symlinkSync(workspace,alias,'junction');
    writeFileSync(join(workspace,'hr-ops.mjs'),'console.log(JSON.stringify({ok:true,prospects:0,root:process.cwd()}));');
    writeFileSync(join(root,'prompt.txt'),'Verify José and São Paulo.');
    writeFileSync(join(bin,'stub.cjs'),`let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>{console.error('nonfatal plugin warning');console.log(JSON.stringify({text,args:process.argv.slice(2),name:'José'}));process.exitCode=${exit};});`);
    writeFileSync(join(bin,`${client}.cmd`),`@echo off\r\n"${process.execPath}" "${join(bin,'stub.cjs')}" %*\r\nexit /b %errorlevel%\r\n`);
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',launcher,'-Client',client,'-Workspace',alias,'-NodeExe',process.execPath,'-PromptFile',join(root,'prompt.txt')],{encoding:'utf8',env:{...process.env,PATH:bin+';'+process.env.PATH},timeout:30000});
    assert.equal(result.status,exit,result.stderr);
    const json=name=>JSON.parse(readFileSync(join(workspace,'local/acceptance',name),'utf8').replace(/^\uFEFF/,''));
    assert.equal(json('exit.json').exit_code,exit);
    const transcript=json('transcript.jsonl');
    assert.equal(transcript.name,'José');assert.match(transcript.text,/São Paulo/);
    if(client==='codex')assert.ok(transcript.args.includes('--search'));
    const stderr=readFileSync(join(workspace,'local/acceptance/stderr.log'));
    assert.match(stderr[0]===255?stderr.subarray(2).toString('utf16le'):stderr.toString('utf8'),/nonfatal plugin warning/);
  });
}

test('Windows launcher rejects a junction pointing at its own checkout',{skip:process.platform!=='win32'},t=>{
  const root=mkdtempSync(join(tmpdir(),'hr isolation '));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const alias=join(root,'checkout-alias');
  symlinkSync(fileURLToPath(new URL('../../',import.meta.url)),alias,'junction');
  writeFileSync(join(root,'prompt.txt'),'Do not run.');
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',launcher,'-Client','codex','-Workspace',alias,'-NodeExe',process.execPath,'-PromptFile',join(root,'prompt.txt')],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/separate acceptance workspace/);
});
