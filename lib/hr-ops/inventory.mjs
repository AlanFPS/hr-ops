import {existsSync, lstatSync, readFileSync, readdirSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import * as yaml from 'js-yaml';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {assert, keys, text, stamp, url, domain, hash, canonical, validateEvidence, scoreProspect, supported} from './model.mjs';
import {candidateKey} from './run-scope.mjs';
import {sourceCatalog, inspectSources} from './sources.mjs';
import {researchBudget} from './research-run.mjs';
import {discoveryFeeds} from './feed-contract.mjs';
import {readCapture, validateFeedCapture} from './feed-captures.mjs';
import {refreshResearchTask} from './research-refresh.mjs';

const STATES = ['unreviewed', 'queued', 'excluded'];
const PRIORITIES = ['high', 'normal', 'low'];
const KINDS = ['user_list', 'legacy', 'seed', 'pipeline', 'feed'];
const idFor = value => hash(canonical(value)).slice(0, 24);
const host = value => domain(value).replace(/\.$/, '');
const empty = () => ({version: 1, revision: 0, observations: [], reviews: []});

function inventoryPath(repo) {
  for (const part of ['data', 'data/hr-ops', 'data/hr-ops/inventory.json']) {
    const stat = lstatSync(join(repo.root, part), {throwIfNoEntry: false});
    if (stat) assert(!stat.isSymbolicLink() && (part.endsWith('.json') ? stat.isFile() : stat.isDirectory()), 'Inventory path must not contain links or non-directories');
  }
  return join(repo.dir, 'inventory.json');
}

function identity(value, now) {
  keys(value, ['website', 'aliases', 'evidence'], 'inventory identity');
  url(value.website);
  assert(Array.isArray(value.aliases) && value.aliases.length <= 20, 'Identity aliases must be an array of at most 20 HTTPS websites');
  const domains = [host(value.website), ...value.aliases.map(host)];
  const shared = ['ashbyhq.com', 'greenhouse.io', 'lever.co', 'workable.com', 'linkedin.com', 'lnkd.in', 'remotive.com', 'remoteok.com', 'himalayas.app', 'news.ycombinator.com'];
  assert(domains.every(d => !shared.some(s => d === s || d.endsWith('.' + s))), 'Use official company domains, not shared ATS, feed or social hosts, for identity');
  assert(new Set(domains).size === domains.length, 'Repeated identity domain or alias');
  assert(Array.isArray(value.evidence) && value.evidence.length > 0 && value.evidence.length <= 20, 'Identity requires supporting evidence');
  for (const evidence of value.evidence) {
    validateEvidence(evidence, now);
    assert(evidence.source_type === 'primary' && evidence.excerpt_kind && evidence.retrieval_precision, 'Identity review requires primary evidence with excerpt kind and retrieval precision');
  }
  return value;
}

function observation(value, now) {
  keys(value, ['id', 'name', 'website_claim', 'icp_hint', 'note', 'source', 'imported_at'], 'inventory observation');
  text(value.name, 'inventory name', 200);
  if (value.website_claim !== null) url(value.website_claim);
  assert(['startup', 'agency', 'unknown'].includes(value.icp_hint), 'Invalid inventory ICP hint');
  if (value.note !== null) text(value.note, 'inventory note', 4000);
  keys(value.source, ['kind', 'reference', 'url', 'observed_at'], 'inventory source');
  assert(KINDS.includes(value.source.kind), 'Invalid inventory source kind');
  text(value.source.reference, 'inventory source reference', 1000);
  if (value.source.url !== null) url(value.source.url);
  if (value.source.observed_at !== null) stamp(value.source.observed_at, now);
  stamp(value.imported_at, now);
  const {id, imported_at, ...content} = value;
  assert(id === idFor(content), 'Inventory observation identity mismatch');
  return value;
}

export function validateInventory(state, now = new Date()) {
  keys(state, ['version', 'revision', 'observations', 'reviews'], 'inventory state');
  assert(state.version === 1, 'Unsupported inventory schema');
  assert(Number.isSafeInteger(state.revision) && state.revision >= 0, 'Invalid inventory revision');
  assert(Array.isArray(state.observations) && Array.isArray(state.reviews), 'Invalid inventory arrays');
  const ids = new Set();
  for (const row of state.observations) {
    observation(row, now);
    assert(row.source.kind === 'user_list', 'Persisted inventory observations must use user_list; other layers are derived');
    assert(!ids.has(row.id), 'Repeated inventory observation'); ids.add(row.id);
  }
  let previous = 0;
  for (const row of state.reviews) {
    keys(row, ['observation_id', 'state', 'priority', 'identity', 'reason', 'at', 'revision'], 'inventory review');
    assert(/^[a-f0-9]{24}$/.test(row.observation_id), 'Invalid inventory observation reference');
    assert(STATES.includes(row.state) && PRIORITIES.includes(row.priority), 'Invalid inventory review state or priority');
    if (Object.hasOwn(row, 'identity') && row.identity !== null) identity(row.identity, now);
    text(row.reason, 'inventory review reason', 4000); stamp(row.at, now);
    assert(Number.isSafeInteger(row.revision) && row.revision > previous && row.revision <= state.revision, 'Invalid inventory review revision');
    previous = row.revision;
  }
  return state;
}

export function readInventory(repo) {
  const path = inventoryPath(repo);
  return existsSync(path) ? validateInventory(JSON.parse(readFileSync(path, 'utf8'))) : empty();
}

function row(name, website, icp, kind, reference, sourceUrl, observedAt, extra = {}) {
  const content = {name, website_claim: website ?? null, icp_hint: icp ?? 'unknown', note: null,
    source: {kind, reference, url: sourceUrl ?? null, observed_at: observedAt ?? null}};
  // Mutable pipeline revisions and refreshed catalog evidence do not invalidate
  // an operator's queue decision on the same source identity.
  return {...content, id: idFor({kind, reference, name, website: website ?? null}), ...extra};
}

// A network-free projection. No source's claimed vacancy count or website is
// converted into reviewed demand, eligibility, or authority to contact anyone.
function builtins(repo, config, now) {
  const records = repo.list();
  const rows = records.map(p => row(p.name, p.website, p.icp, 'pipeline', p.id, p.discovery_source, p.updated_at,
    {verified_domains: p.domains.map(d => host('https://' + d)), prospect_id: p.id}));
  const catalog = sourceCatalog();
  const sources = inspectSources(config, {starter: true, now});
  assert(!sources.diagnostics.length, 'Invalid configured inventory sources: ' + JSON.stringify(sources.diagnostics));
  for (const s of sources.sources) rows.push(row(s.name, s.website, s.icp, 'seed', host(s.website), s.identity_evidence.url, s.identity_evidence.observed_at,
    {verified_domains: [host(s.website)], identity_evidence: [s.identity_evidence], identity_stale: s.identity_stale}));
  const legacy = yaml.load(readFileSync(new URL('../../templates/portals.example.yml', import.meta.url), 'utf8'));
  for (const s of legacy.tracked_companies ?? []) rows.push(row(s.name, null, 'unknown', 'legacy', s.careers_url ?? s.name, s.careers_url, null,
    {legacy_enabled: s.enabled !== false, research_url: s.careers_url ?? s.api ?? null}));
  const dir = join(repo.dir, 'research-runs'), pattern = new RegExp(config.discovery.role_pattern, 'i');
  if (existsSync(dir)) for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const state = researchBudget(repo, config, file.slice(0, -5));
    for (const id of state.captures ?? []) {
      const capture = readCapture(repo, id);
      if (capture.kind !== 'hr-discovery-feed-v1') continue;
      const feed = discoveryFeeds(config).find(f => f.id === capture.feed_id);
      const valid = validateFeedCapture(repo, feed, state, id, capture);
      for (const item of valid.collection.rows) {
        const title = feed.id === 'hackernews' ? item.title.split('|')[1]?.trim() ?? item.title : item.title;
        if (!pattern.test(title)) continue;
        rows.push(row(item.company, item.published_website, 'startup', 'feed', `${state.run}:${id}:${item.posting_id ?? item.source_url}:${hash(item).slice(0, 16)}`, item.source_url, capture.observed_at,
          {enabled: feed.enabled, feed_id: feed.id, run: state.run, source_sequence: item.source_sequence, capture_id: id,
            collection_partial: valid.collection.partial, reported_role: item.title, reported_geography: item.location}));
      }
    }
  }
  return {rows, records, catalog};
}

export function inventoryView(repo, config, {now = new Date(), state = readInventory(repo), icp = 'both', queue = false, scope = 'new', limit = 1000} = {}) {
  assert(['both', 'agency', 'startup', 'unknown'].includes(icp), 'Invalid inventory ICP');
  assert(['new','refresh','all'].includes(scope)&& (queue||scope==='new'), 'Inventory scope requires queue and new, refresh or all');
  assert(Number.isSafeInteger(limit) && limit > 0 && limit <= 10000, 'Inventory limit must be 1..10000');
  validateInventory(state, now);
  const {rows: derived, records, catalog} = builtins(repo, config, now);
  const reviews = new Map(state.reviews.map(r => [r.observation_id, r]));
  const observations = [...new Map([...derived, ...state.observations].map(o => [o.id, o])).values()].map(o => {
    const review = reviews.get(o.id);
    const domains = review && Object.hasOwn(review, 'identity') ? review.identity ? [host(review.identity.website), ...review.identity.aliases.map(host)] : [] : o.verified_domains ?? [];
    // Pipeline identity is canonical; a lead review cannot remove its aliases.
    return {...o, verified_domains: [...new Set([...(o.prospect_id ? o.verified_domains : []), ...domains])], review: review ?? null};
  });
  const parent = new Map();
  const root = d => {if (!parent.has(d)) parent.set(d, d); if (parent.get(d) !== d) parent.set(d, root(parent.get(d))); return parent.get(d);};
  const union = (a, b) => {a = root(a); b = root(b); if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);};
  for (const o of observations) for (const d of o.verified_domains) union(o.verified_domains[0], d);
  const groups = new Map();
  for (const o of observations) {
    const key = o.verified_domains.length ? 'domain:' + root(o.verified_domains[0]) : 'unresolved:' + o.id;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
  }
  const disabled = config.discovery.sources.filter(s => s.enabled === false).map(s => host(s.website));
  const controls = catalog.controls ?? [];
  const output = [...groups.entries()].map(([key, members]) => {
    const prospectIds = [...new Set(members.map(o => o.prospect_id).filter(Boolean))];
    assert(prospectIds.length <= 1, 'Reviewed inventory aliases join multiple canonical prospects; resolve prospect identity separately');
    const domains = [...new Set(members.flatMap(o => o.verified_domains))].sort();
    const names = [...new Set(members.map(o => o.name))];
    const hints = [...new Set(members.map(o => o.icp_hint).filter(k => k !== 'unknown'))];
    const excluded = members.some(o => o.review?.state === 'excluded');
    const active = members.some(o => o.enabled !== false);
    const claimed = members.map(o => o.website_claim).filter(Boolean).map(host);
    const disabledMatch = [...domains, ...claimed].some(d => disabled.some(x => d === x || d.endsWith('.' + x)));
    const control = controls.some(s => names.some(n => candidateKey(n) === candidateKey(s.name)) || [...domains, ...claimed].some(d => d === host(s.website) || d.endsWith('.' + host(s.website))));
    const block = prospectIds.length ? 'existing_prospect' : control ? 'catalog_control' : disabledMatch || !active ? 'source_disabled' : excluded ? 'inventory_excluded' : null;
    const p = records.find(p => p.id === prospectIds[0]);
    return {id: idFor(key), name: p?.name ?? names[0], names, domains, identity_status: domains.length ? 'supported' : 'unresolved',
      icp: p?.icp ?? (hints.length === 1 ? hints[0] : 'unknown'), icp_conflict: hints.length > 1,
      prospect_id: p?.id ?? null, qualification_tier: p ? scoreProspect(p, config, now).tier : null,
      state: excluded ? 'excluded' : members.some(o => o.review?.state === 'queued') ? 'queued' : 'unreviewed',
      priority: PRIORITIES.find(priority => members.some(o => o.review?.priority === priority)) ?? 'normal',
      queue_blocker: block, possible_matches: [], observations: members,
      next_step: block === 'existing_prospect' ? 'Use research/status on the existing prospect; do not rediscover it.' : block ? 'Excluded from new-company research queue: ' + block :
        domains.length ? 'Verify current attributable engineering demand, US market, country scope, size, service fit and restrictions before prospect import.' : 'Resolve official company identity and possible duplicates before prospect import.',
      send_enabled: false};
  });
  const nameIndex = new Map(), domainIndex = new Map(), claimIndex = new Map();
  for (const g of output) {
    for (const name of g.names) {const key = candidateKey(name); if (!nameIndex.has(key)) nameIndex.set(key, new Set()); nameIndex.get(key).add(g.id);}
    for (const d of g.domains) {if (!domainIndex.has(d)) domainIndex.set(d, new Set()); domainIndex.get(d).add(g.id);}
    for (const o of g.observations) if (o.website_claim) {const d=host(o.website_claim); if(!claimIndex.has(d))claimIndex.set(d,new Set()); claimIndex.get(d).add(g.id);}
  }
  for (const g of output) {
    const matches = new Set(g.names.flatMap(n => [...(nameIndex.get(candidateKey(n)) ?? [])]));
    for (const d of [...g.domains, ...g.observations.map(o=>o.website_claim?host(o.website_claim):null).filter(Boolean)])
      for (const id of [...(domainIndex.get(d) ?? []), ...(claimIndex.get(d) ?? [])]) matches.add(id);
    matches.delete(g.id); g.possible_matches = [...matches].sort();
    if (g.possible_matches.length && !g.queue_blocker) g.next_step = 'Review possible identity matches before researching this as a new company.';
    g.queue_task = g.queue_blocker ? null : g.possible_matches.length || g.icp_conflict ? 'identity_review' : g.domains.length ? 'demand_research' : 'identity_research';
  }
  if(queue&&scope!=='new')for(const g of output)if(g.prospect_id){
    const p=records.find(p=>p.id===g.prospect_id);
    const size=p.facts[p.icp==='agency'?'recruiter_count':'employee_count'],range=config.icps[p.icp][p.icp==='agency'?'recruiter_range':'employee_range'];
    const values=Array.isArray(size.value)?size.value:[size.value,size.value];
    const outside=size.confidence==='observed'&&supported(p,size,config.freshness.facts,now)&&(values[1]<range[0]||values[0]>range[1]);
    const blocked=p.suppressed||p.hold||['CLIENT','LOST','DISQUALIFIED'].includes(p.status)||g.state==='excluded'||outside||scoreProspect(p,config,now).blockers.length||
      [...g.domains,...g.observations.filter(o=>o.website_claim).map(o=>host(o.website_claim))].some(d=>disabled.some(x=>d===x||d.endsWith('.'+x)))||
      controls.some(s=>g.names.some(n=>candidateKey(n)===candidateKey(s.name))||g.domains.some(d=>d===host(s.website)||d.endsWith('.'+host(s.website))));
    if(!blocked){g.refresh=refreshResearchTask(repo,p,config,now);if(g.refresh.reasons.length){g.queue_task='refresh_research';g.queue_blocker=null;}}
  }
  const selected = output.filter(g => (icp === 'both' || g.icp === icp) && (!queue || !g.queue_blocker&&
    (scope==='all'||(scope==='refresh')===(g.queue_task==='refresh_research'))))
    .sort((a, b) => Number(b.state === 'queued') - Number(a.state === 'queued') || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      (a.refresh?.urgency??3)-(b.refresh?.urgency??3)||a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {kind: queue ? 'hr-inventory-research-queue' : 'hr-company-inventory', schema_version: 1, revision: state.revision,
    summary: {supported_company_groups: output.filter(g => g.domains.length).length, unresolved_lead_groups: output.filter(g => !g.domains.length).length,
      groups_with_possible_matches: output.filter(g => g.possible_matches.length).length, pipeline_prospects: records.length,
      observations_by_layer: Object.fromEntries(KINDS.map(k => [k, observations.filter(o => o.source.kind === k).length])),
      research_queue_tasks: output.filter(g => !g.queue_blocker).length,
      queue_by_task: Object.fromEntries(['identity_review','identity_research','demand_research','refresh_research'].map(k=>[k,output.filter(g=>g.queue_task===k).length]))},
    queue_scope:queue?scope:null,
    matched: selected.length, returned: Math.min(selected.length, limit), truncated: selected.length > limit, companies: selected.slice(0, limit),
    orphaned_review_ids: [...reviews.keys()].filter(id => !observations.some(o => o.id === id)),
    note: 'Layers overlap. Unresolved groups and possible matches are not a unique company count. Identity support is not current hiring, qualification, buying intent or contact permission.',
    network_reads_allowed: false, send_enabled: false};
}

// Collection is already persisted as validated captures. Link those observations
// to the projection, rather than copying them into user-list or prospect JSON.
export function linkFeedInventory(repo, config, result, now = new Date()) {
  const inventory = inventoryView(repo, config, {now, limit: 10000});
  const byId = new Map(inventory.companies.map(g => [g.id, g]));
  const excluded = [...result.excluded], tasks = [];
  for (const task of result.research_tasks) {
    const keys = new Set(task.observations.map(o => candidateKey(o.company) + '\n' + o.source_url));
    const own = inventory.companies.filter(g => g.observations.some(o =>
      o.capture_id === result.collection_capture_id && o.run === result.run && keys.has(candidateKey(o.name) + '\n' + o.source.url)));
    if (own.length && own.every(g => g.queue_blocker)) {
      excluded.push({company: task.name, source_url: task.observations[0].source_url,
        reason: own[0].queue_blocker, inventory_ids: own.map(g => g.id), needs_identity_review: false});
      continue;
    }
    const possible = [...new Set([
      ...own.flatMap(g => g.possible_matches).filter(id => !own.some(g => g.id === id)),
      ...own.filter(g => g.queue_blocker).map(g => g.id),
    ])];
    tasks.push({...task, inventory_observation_ids: own.flatMap(g => g.observations.filter(o => o.capture_id === result.collection_capture_id &&
      keys.has(candidateKey(o.name) + '\n' + o.source.url)).map(o => o.id)), inventory_ids: own.map(g => g.id),
      inventory_matches: possible.map(id => byId.get(id)).filter(Boolean).map(g => ({id:g.id,name:g.name,identity_status:g.identity_status,state:g.state,queue_blocker:g.queue_blocker,prospect_id:g.prospect_id})),
      requires_inventory_review: possible.length > 0 || !own.length || inventory.truncated,
      inventory_next_step: possible.length ? 'Review existing inventory matches before treating this as a new company. Name/website claims do not prove identity.' : 'Resolve identity using the linked inventory observations before prospect import.'});
  }
  return {...result, research_tasks: tasks, excluded, inventory_revision: inventory.revision, inventory_links_partial: inventory.truncated,
    inventory_note: 'Captured feed observations are visible in inventory and its research queue. Links are unverified; no prospects were created or qualified.'};
}

export async function importInventory(repo, config, payload, {expectedRevision, dryRun = false, now = new Date()} = {}) {
  keys(payload, ['source', 'companies'], 'inventory import');
  keys(payload.source, ['reference', 'url', 'observed_at'], 'inventory import source');
  text(payload.source.reference, 'source reference', 1000);
  if (payload.source.url != null) url(payload.source.url);
  if (payload.source.observed_at != null) stamp(payload.source.observed_at, now);
  assert(Array.isArray(payload.companies) && payload.companies.length > 0 && payload.companies.length <= 1000, 'Import requires 1..1000 companies');
  const additions = payload.companies.map(c => {
    keys(c, ['name', 'website', 'icp', 'note'], 'inventory company');
    const r = row(text(c.name, 'company name', 200), c.website ?? null, c.icp ?? 'unknown', 'user_list', payload.source.reference,
      payload.source.url ?? null, payload.source.observed_at ?? null);
    r.note = c.note ?? null; const {id, ...content} = r; r.id = idFor(content); r.imported_at = now.toISOString();
    return observation(r, now);
  });
  const perform = () => {
    const state = readInventory(repo);
    assert(Number.isSafeInteger(expectedRevision) && expectedRevision === state.revision, 'Inventory revision conflict; reload inventory and retry');
    const seen = new Set(state.observations.map(o => o.id)); let added = 0;
    for (const o of additions) if (!seen.has(o.id)) {state.observations.push(o); seen.add(o.id); added++;}
    if (added) state.revision++;
    validateInventory(state, now);
    if (added && !dryRun) {const path = inventoryPath(repo); mkdirSync(repo.dir, {recursive: true}); writeFileAtomic(path, JSON.stringify(state, null, 2) + '\n');}
    return {revision: state.revision, added_observations: added, repeated_observations: additions.length - added, dry_run: dryRun, prospects_created: 0, send_enabled: false};
  };
  return dryRun ? perform() : repo.lock(perform);
}

export async function reviewInventory(repo, config, payload, {expectedRevision, dryRun = false, now = new Date()} = {}) {
  keys(payload, ['observation_id', 'state', 'priority', 'identity', 'reason'], 'inventory review input');
  text(payload.reason, 'review reason', 4000);
  assert(/^[a-f0-9]{24}$/.test(payload.observation_id), 'Invalid observation ID');
  const perform = () => {
    const state = readInventory(repo);
    assert(Number.isSafeInteger(expectedRevision) && expectedRevision === state.revision, 'Inventory revision conflict; reload inventory and retry');
    const view = inventoryView(repo, config, {state, now, limit: 10000});
    const observed = view.companies.flatMap(c => c.observations).find(o => o.id === payload.observation_id);
    assert(observed, 'Unknown inventory observation ID');
    const previous = observed.review;
    const next = {observation_id: observed.id, state: payload.state ?? previous?.state ?? 'unreviewed', priority: payload.priority ?? previous?.priority ?? 'normal',
      ...(Object.hasOwn(payload, 'identity') ? {identity: payload.identity} : previous && Object.hasOwn(previous, 'identity') ? {identity: previous.identity} : {}),
      reason: payload.reason, at: now.toISOString(), revision: state.revision + 1};
    state.revision++; state.reviews.push(next); validateInventory(state, now);
    inventoryView(repo, config, {state, now, limit: 10000}); // Detect alias conflicts before persistence.
    if (!dryRun) writeFileAtomic(inventoryPath(repo), JSON.stringify(state, null, 2) + '\n');
    return {revision: state.revision, review: next, dry_run: dryRun, prospects_changed: 0, send_enabled: false};
  };
  return dryRun ? perform() : repo.lock(perform);
}
