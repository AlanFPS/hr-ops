// HR entrypoints share the existing workspace contract; they never clone data,
// install another agent client, or modify the caller's root selection.
export function setupGuide(codeRoot) {
  return {
    product: 'HR-Ops', minimum_node: 24, code_root: codeRoot,
    command: ['node','hr-ops.mjs','setup','--destination','ABSOLUTE_EMPTY_DIRECTORY','--input','setup.json'],
    input: {name:'Your firm workspace',purpose:'experimental',config:{firm:{name:null,sender_name:null,email:null}}},
    purpose_options: ['experimental','operating'],
    instructions: [
      'Use an explicit new or empty destination. Supply only confirmed firm facts and preferences.',
      'Creation preserves existing workspaces and never copies prospects, profiles, inbox history or cookies.',
      'Keep code in this checkout. Select the created data root explicitly with HR_OPS_ROOT before operating.',
      'Start Codex or Claude Code in code_root with that environment. Both use the shared HR skill; slash commands are optional.',
      'Run doctor, then ask the agent to use an HR mode. No CV, candidate onboarding or browser installation is required for research.',
    ],
    shared_skill: '.agents/skills/hr-ops/SKILL.md',
    optional_browser: 'Only the separate human-operated LinkedIn workflows need Chromium; see docs/HR_OPS_LINKEDIN.md.',
    legacy: 'scaffolder/bin/cli.mjs and the retained dashboards are Career-Ops candidate tools, not HR setup.',
    send_enabled: false,
  };
}

export function commandMenu(codeRoot) {
  return {
    product: 'HR-Ops', code_root: codeRoot, shared_skill: '.agents/skills/hr-ops/SKILL.md',
    groups: [
      {name:'Setup and health',commands:['setup','workspace inspect','doctor','config','build']},
      {name:'Discovery and research',commands:['inventory','inventory queue','discover --plan --icp both','discover --feed remotive --run RUN_ID','discover --feed remoteok --run RUN_ID','discover --feed himalayas --run RUN_ID','sources --catalog','research COMPANY','qualify COMPANY','contacts COMPANY']},
      {name:'Pipeline and human review',commands:['pipeline','outreach COMPANY','followups --due today','status COMPANY','report']},
      {name:'Recovery',commands:['backup','restore BACKUP --destination NEW_DIRECTORY','reports refresh']},
    ],
    natural_language_examples: ['Use HR-Ops to find and evaluate potential US recruiting clients.','Show the research gaps for the strongest prospects.','Prepare concise LinkedIn drafts for human review.'],
    discovery_note: 'Feed collection creates unverified lead tasks, not qualified prospects. Agency discovery uses verified client-vacancy sources and dedicated query/directory plans.',
    browser_note: 'Explicit inbox/send requests use separate human-login workflows, not the core CLI.',
    legacy: {label:'Career-Ops candidate tools: explicit legacy invocation only',installer:'scaffolder/bin/cli.mjs',dashboard_commands:['npm run build:dashboard','npm run serve:dashboard'],skill:'.agents/skills/career-ops/SKILL.md'},
    send_enabled:false,
  };
}
