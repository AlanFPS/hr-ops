import {assert, keys, text, url, stamp} from './model.mjs';
import {candidateKey} from './run-scope.mjs';

export function validateCandidateOrigin(origin,state){
  keys(origin,['name','source_url','source_sequence','reason','recorded_at','late'],'candidate origin');
  candidateKey(origin.name);
  if(origin.source_url===null)text(origin.reason,'Unknown discovery origin reason',1000);
  else url(origin.source_url);
  assert(Number.isSafeInteger(origin.source_sequence)&&state.attempts.some(a=>a.sequence===origin.source_sequence),'Origin requires an existing discovery attempt');
  if(origin.reason!==undefined)text(origin.reason,'Origin reason',1000);
  stamp(origin.recorded_at);
  assert(typeof origin.late==='boolean','Origin late flag required');
}

export function admitCandidate(state,input,now=new Date()){
  assert(state.scope,'Configure run scope before admitting candidates');
  keys(input,['name','source_url','source_sequence','reason'],'candidate admission');
  const existing=(state.candidate_origins??[]).find(o=>candidateKey(o.name)===candidateKey(input.name));
  if(existing){
    assert(existing.source_url===input.source_url&&existing.source_sequence===input.source_sequence&&existing.reason===input.reason,'Candidate origin is immutable; retain the original and document corrections as research evidence');
    return existing;
  }
  const origin={...input,recorded_at:now.toISOString(),late:state.attempts.some(a=>a.candidate_names?.some(n=>candidateKey(n)===candidateKey(input.name)))};
  validateCandidateOrigin(origin,state);
  state.candidate_origins??=[];state.candidate_origins.push(origin);
  return origin;
}

export function bindCandidateOrigin(input,state){
  const origin=state?.candidate_origins?.find(o=>candidateKey(o.name)===candidateKey(input.name));
  if(!origin)return input;
  assert(input.discovery_source===undefined||input.discovery_source===origin.source_url,'Discovery source conflicts with recorded candidate origin');
  if(origin.source_url===null){const {discovery_source,...rest}=input;return rest;}
  return {...input,discovery_source:origin.source_url};
}
