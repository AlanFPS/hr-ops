#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import {runAcceptanceTests,acceptanceSummary,writeAcceptance} from '../lib/hr-ops/acceptance.mjs';
import {requireRuntime} from '../lib/hr-ops/client.mjs';
requireRuntime();
const root=fileURLToPath(new URL('../',import.meta.url));
const action=process.argv[2];
if (action==='test') console.log(JSON.stringify(runAcceptanceTests(root),null,2));
else if(action==='summary') {
  const result=acceptanceSummary(root);
  writeAcceptance(root,'local/acceptance/summary.json',result);
  console.log(JSON.stringify(result,null,2));
} else throw new Error('Usage: node scripts/hr-ops-pilot.mjs test|summary');
