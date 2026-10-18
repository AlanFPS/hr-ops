#!/usr/bin/env node
import {createReadStream,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {acceptancePath,writeAcceptanceInput} from '../lib/hr-ops/acceptance.mjs';
import {requireRuntime} from '../lib/hr-ops/client.mjs';
requireRuntime();
try {
  const args=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i+=2){
    if(!['--input','--output'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw new Error('Use --input FILE|- --output local/RELATIVE_FILE');
    options[args[i]]=args[i+1];
  }
  const root=fileURLToPath(new URL('../',import.meta.url)), output=options['--output'];
  if(!options['--input'] || typeof output!=='string' || !/^local[\\/]/.test(output))throw new Error('Use --input FILE|- --output local/RELATIVE_FILE');
  const local=acceptancePath(root,'local');mkdirSync(local,{recursive:true});
  acceptancePath(local,output.slice(6));
  const stream=options['--input']==='-'?process.stdin:createReadStream(acceptancePath(root,options['--input']));
  console.log(JSON.stringify(await writeAcceptanceInput(local,output.slice(6),stream),null,2));
} catch(error) { console.error(error.message);process.exitCode=1; }
