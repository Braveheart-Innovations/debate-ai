/**
 * The Salesforce models' helpers, run by the local python3 through the same
 * run_recipe the sandbox installs (with a stub matplotlib, as recipeRunner.test
 * does): a change's reach, who can see fields, and an org limit's forecast.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RECIPE_RUNNER_SOURCE } from '../../../sandbox/runtime';

const PLT_STUB = `
import os as _sym_os, json as _sym_json
class _Plt:
    def close(self, which): pass
    def get_fignums(self): return []
plt = _Plt()
`;

interface ModelItem { kind: string; label?: string; value?: unknown; detail?: string; title?: string; headers?: string[]; rows?: unknown[][]; text?: string }

const D = '/uploads/qa.zip#force-app/main/default';

const references = {
  version: 1,
  kind: 'salesforce_references',
  diagram: 'leads.diagram.json',
  generatedAt: '2026-10-16T00:00:00Z',
  files: [`${D}/flows/Conversion_3.flow-meta.xml`, `${D}/layouts/Lead-All Fields.layout-meta.xml`, `${D}/flows/Conversion_2.flow-meta.xml`, `${D}/flows/Conversion_4.flow-meta.xml`, `${D}/quickActions/Lead.Pre.quickAction-meta.xml`, `${D}/flexipages/Lead_Page.flexipage-meta.xml`],
  objects: {
    Lead: {
      references: [],
      labelMentions: [],
      surface: { layouts: [], recordTypes: [], flexipages: [], permissionSets: { read: [], edit: [] }, profiles: { read: [], edit: [] } },
      fields: {
        Ready_to_Convert__c: {
          references: [
            { file: 0, line: 37, kind: 'flow', component: 'Conversion_3', how: 'entry condition' },
            { file: 1, line: 31, kind: 'layout', component: 'Lead-All Fields' },
          ],
          access: { permissionSets: { read: 2, edit: 1 }, profiles: { read: 40, edit: 39 } },
        },
      },
    },
  },
  calls: [
    { from: 'flow:Conversion_3', to: 'flow:Conversion_2', how: 'subflow', file: 0, line: 50 },
    { from: 'flow:Conversion_2', to: 'event:Convert_Lead__e', how: 'publishes', file: 2, line: 900 },
    { from: 'event:Convert_Lead__e', to: 'flow:Conversion_4', how: 'starts', file: 3, line: 3 },
    { from: 'flow:Conversion_4', to: 'apex:ConvertLeadsInvocable', how: 'apex', file: 3, line: 29 },
    { from: 'quickAction:Lead.Pre', to: 'flow:Conversion_3', how: 'runs', file: 4, line: 3 },
    { from: 'flexipage:Lead_Page', to: 'quickAction:Lead.Pre', how: 'hosts', file: 5, line: 40 },
    // A page hosting the action is upstream only: nothing a page hosts runs because the field changed.
    { from: 'flexipage:Lead_Page', to: 'quickAction:Lead.Other', how: 'hosts', file: 5, line: 41 },
  ],
  limits: ['Static references only.'],
};

const access = {
  version: 1,
  kind: 'salesforce_access',
  diagram: 'leads.diagram.json',
  generatedAt: '2026-10-16T00:00:00Z',
  holders: [
    { kind: 'profile', name: 'Center Director', source: 'x' },
    { kind: 'profile', name: 'Admin', source: 'x', viewAllData: true },
    { kind: 'permissionSet', name: 'Lead_Editor', label: 'Lead Editor', source: 'x' },
    { kind: 'permissionSetGroup', name: 'Lead_Team', label: 'Lead Team', source: 'x', permissionSets: [2] },
    { kind: 'permissionSet', name: 'Field_Only', source: 'x' },
  ],
  objects: {
    Lead: {
      sharingModel: 'Private',
      externalSharingModel: 'Private',
      grants: [
        { holder: 0, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        { holder: 1, read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true },
        { holder: 2, read: true, create: false, edit: true, delete: false, viewAll: false, modifyAll: false },
      ],
      fields: {
        Ready_to_Convert__c: { read: [0, 1, 2, 4], edit: [1, 2] },
        Status: { read: [0, 1], edit: [1] },
      },
    },
  },
  limits: ['Who can, not who does.'],
};

describe('the Salesforce models', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-models-'));
    fs.writeFileSync(path.join(dir, 'leads.references.json'), JSON.stringify(references));
    fs.writeFileSync(path.join(dir, 'leads.access.json'), JSON.stringify(access));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function run(body: string, params: Record<string, unknown>): ModelItem[] {
    const recipe = path.join(dir, 'model.recipe.py');
    fs.writeFileSync(recipe, `PARAMS = ${JSON.stringify(params).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False')}\n${body}\n`);
    const script = path.join(dir, 'harness.py');
    fs.writeFileSync(script, `${PLT_STUB}\n${RECIPE_RUNNER_SOURCE}\nrun_recipe(${JSON.stringify(recipe)})\n`);
    execFileSync('python3', ['-I', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(fs.readFileSync(path.join(dir, 'model', 'model.json'), 'utf8')).items;
  }

  const table = (items: ModelItem[], title: string) => {
    const found = items.find((item) => item.kind === 'table' && item.title === title);
    return found ? found.rows!.map((row) => Object.fromEntries(found.headers!.map((header, index) => [header, row[index]]))) : undefined;
  };
  const metric = (items: ModelItem[], label: string) => items.find((item) => item.kind === 'metric' && item.label === label);

  it('walks a field change: what refers to it, what runs next along calls, and what starts it', () => {
    const items = run(
      `show_impact(salesforce_impact(${JSON.stringify(path.join(dir, 'leads.references.json'))}, PARAMS["changes"], depth=PARAMS["depth"]))`,
      { changes: 'Lead.ready_to_convert__c, Lead.Nope__c', depth: 4 },
    );
    expect(table(items, 'What refers to it')).toEqual([
      { Change: 'Lead.Ready_to_Convert__c', Component: 'Conversion_3', Kind: 'Flow', How: 'entry condition', Where: 'flows/Conversion_3.flow-meta.xml:37' },
      { Change: 'Lead.Ready_to_Convert__c', Component: 'Lead-All Fields', Kind: 'Page layout', How: '', Where: 'layouts/Lead-All Fields.layout-meta.xml:31' },
    ]);
    expect(table(items, 'What runs next')).toEqual([
      { Hop: 2, Component: 'Conversion_2', Kind: 'Flow', Path: 'Conversion_3 → Conversion_2 (subflow)', Where: 'flows/Conversion_3.flow-meta.xml:50' },
      { Hop: 3, Component: 'Convert_Lead__e', Kind: 'Platform event', Path: 'Conversion_3 → Conversion_2 (subflow) → Convert_Lead__e (publishes)', Where: 'flows/Conversion_2.flow-meta.xml:900' },
      { Hop: 4, Component: 'Conversion_4', Kind: 'Flow', Path: 'Conversion_3 → Conversion_2 (subflow) → Convert_Lead__e (publishes) → Conversion_4 (starts)', Where: 'flows/Conversion_4.flow-meta.xml:3' },
    ]);
    expect(table(items, 'What starts it')).toEqual([
      { Hop: 2, Component: 'Lead.Pre', Kind: 'Quick action', Path: 'Conversion_3 ← Lead.Pre (runs)', Where: 'quickActions/Lead.Pre.quickAction-meta.xml:3' },
      { Hop: 3, Component: 'Lead_Page', Kind: 'Lightning page', Path: 'Conversion_3 ← Lead.Pre (runs) ← Lead_Page (hosts)', Where: 'flexipages/Lead_Page.flexipage-meta.xml:40' },
    ]);
    expect(metric(items, 'Components that refer to it')).toMatchObject({ value: 2, detail: '2 references' });
    expect(items.filter((item) => item.kind === 'note').map((item) => item.text)).toEqual([
      'Lead.Ready_to_Convert__c: 40 profiles and 2 permission sets can read it; 39 and 1 can edit it.',
      'Not in the references index: Lead.Nope__c. It covers the objects the data model draws; name them as Object.Field.',
      'Static references only.',
    ]);
  });

  it('leaves pages, layouts and reports out when asked, and stops at the furthest hop', () => {
    const items = run(
      `show_impact(salesforce_impact(${JSON.stringify(path.join(dir, 'leads.references.json'))}, PARAMS["changes"], depth=PARAMS["depth"], include_ui=PARAMS["ui"]))`,
      { changes: 'Lead.Ready_to_Convert__c', depth: 2, ui: false },
    );
    expect(table(items, 'What refers to it')!.map((row) => row.Component)).toEqual(['Conversion_3']);
    expect(table(items, 'What runs next')!.map((row) => row.Component)).toEqual(['Conversion_2']);
    expect(table(items, 'What starts it')!.map((row) => row.Component)).toEqual(['Lead.Pre']);
  });

  it('says who can read and edit each field, through groups, with active users by profile', () => {
    const users = path.join(dir, 'users.csv');
    fs.writeFileSync(users, 'kind,name,users\nprofile,Center Director,3386\nprofile,Admin,12\npermissionSet,Lead_Editor,40\n');
    const items = run(
      `show_access(salesforce_access(${JSON.stringify(path.join(dir, 'leads.access.json'))}, PARAMS["fields"], users=${JSON.stringify(users)}))`,
      { fields: 'Lead' },
    );
    expect(table(items, 'Who can read and edit each field')).toEqual([
      { Field: 'Lead.Ready_to_Convert__c', 'Profiles (read)': 2, 'Permission sets (read)': 2, 'Groups (read)': 1, 'Profiles (edit)': 1, 'Permission sets (edit)': 1, 'Active users (profiles)': 3398 },
      { Field: 'Lead.Status', 'Profiles (read)': 2, 'Permission sets (read)': 0, 'Groups (read)': 0, 'Profiles (edit)': 1, 'Permission sets (edit)': 0, 'Active users (profiles)': 3398 },
    ]);
    expect(table(items, 'Who sees the most')![0]).toEqual({ Holder: 'Admin', Kind: 'Profile', 'Fields it can read': 2, 'Fields it can edit': 2 });
    expect(table(items, 'Sharing model: which records')).toEqual([{ Object: 'Lead', 'Sharing model (internal)': 'Private', External: 'Private' }]);
    expect(metric(items, 'Profiles that can read at least one')).toMatchObject({ value: 2 });
    const notes = items.filter((item) => item.kind === 'note').map((item) => item.text);
    expect(notes).toContain('View All Data sees every record and field, whatever the field permissions: Admin.');
    expect(notes).toContain('These grant a field but not read on its object, so they open it only with another grant that does: Field_Only.');
  });

  it('projects a storage limit from its readings, and a daily limit from its busiest day', () => {
    const readings = path.join(dir, 'limits.csv');
    fs.writeFileSync(readings, [
      'limit,max,remaining,at',
      'DataStorageMB,486640,293717,2026-08-19T19:00:00Z',
      'DataStorageMB,486640,293213,2026-08-25T16:17:00Z',
      'SingleEmail,10000,9023,2026-08-28T15:24:00Z',
      'SingleEmail,10000,9500,2026-08-28T09:00:00Z',
    ].join('\n'));
    const storage = run(`show_forecast(forecast_limits(${JSON.stringify(readings)}, PARAMS["limit"], threshold=PARAMS["threshold"], months=PARAMS["months"]))`, { limit: 'DataStorageMB', threshold: 90, months: 24 });
    expect(metric(storage, 'DataStorageMB (in use)')).toMatchObject({ value: 193427, detail: '39.75% of 486640' });
    // 504 MB over 5.9 days: about 2,600 MB a month, nowhere near 90% in two years.
    expect(Number(metric(storage, 'Growth a month')!.value)).toBeCloseTo(2603, -1);
    expect(metric(storage, 'Reaches 90%')).toMatchObject({ value: 'not within 24 months' });

    const archived = run(`show_forecast(forecast_limits(${JSON.stringify(readings)}, PARAMS["limit"], growth=PARAMS["growth"], archive=PARAMS["archive"], months=PARAMS["months"]))`, { limit: 'DataStorageMB', growth: 10, archive: 50000, months: 24 });
    expect(metric(archived, 'DataStorageMB (in use)')).toMatchObject({ value: 143427 });
    expect(metric(archived, 'Reaches 90%')!.value).toMatch(/^20\d\d-\d\d-\d\d$/);

    const email = run(`show_forecast(forecast_limits(${JSON.stringify(readings)}, PARAMS["limit"], growth=PARAMS["growth"]))`, { limit: 'SingleEmail', growth: 5 });
    expect(metric(email, 'SingleEmail (busiest day)')).toMatchObject({ value: 977, detail: '9.77% of 10000' });
  });

  it('names the limits the readings have when the one asked for is missing', () => {
    const readings = path.join(dir, 'limits.csv');
    fs.writeFileSync(readings, 'limit,max,remaining,at\nFileStorageMB,8537800,7530305,2026-08-25T16:17:00Z\n');
    expect(() => run(`forecast_limits(${JSON.stringify(readings)}, 'DataStorageMB')`, {})).toThrow(/No readings for DataStorageMB. The readings have: FileStorageMB/);
  });
});
