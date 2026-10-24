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
import { modelResultsProblem } from '../../contract/services/analyze/models/modelResults';

const PLT_STUB = `
import os as _sym_os, json as _sym_json
class _Plt:
    def close(self, which): pass
    def get_fignums(self): return []
plt = _Plt()
`;

interface ModelItem { kind: string; label?: string; value?: unknown; detail?: string; title?: string; headers?: string[]; rows?: unknown[][]; details?: Array<Array<{ label: string; values: string[] }> | null>; text?: string }

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
    { kind: 'permissionSetGroup', name: 'Lead_Team', label: 'Lead Team', source: 'x', permissionSets: [2], mutingPermissionSets: [5] },
    { kind: 'permissionSet', name: 'Field_Only', source: 'x' },
    { kind: 'mutingPermissionSet', name: 'No_Status_Edit', source: 'x' },
    { kind: 'permissionSet', name: 'Read_All', label: 'Read All', source: 'x' },
  ],
  objects: {
    Lead: {
      sharingModel: 'Private',
      externalSharingModel: 'Private',
      grants: [
        { holder: 0, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        { holder: 1, read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true },
        { holder: 2, read: true, create: false, edit: true, delete: false, viewAll: false, modifyAll: false },
        { holder: 6, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false, viewAllFields: true },
      ],
      fields: {
        // A required field: no field permissions at all.
        Company: { read: [], edit: [] },
        // Center Director may edit the field but not the object; Field_Only has the field but not the object.
        Ready_to_Convert__c: { read: [0, 1, 2, 4], edit: [0, 1, 2] },
        // Lead Team's muting set mutes editing Status.
        Status: { read: [0, 1, 2], edit: [1, 2, 5] },
      },
    },
    Account: {
      grants: [
        { holder: 0, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        { holder: 1, read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true },
      ],
      // Both profiles turn read off: hidden, not a field without field-level security.
      fields: { Rating: { read: [], edit: [], off: [0, 1] } },
    },
    Holiday__mdt: {
      noFieldSecurity: 'customMetadataType',
      grants: [{ holder: 1, read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false }],
      // Admin's read off hides nothing: the field follows the type's access.
      fields: { Date__c: { read: [], edit: [], off: [1] } },
    },
    // No holder names Task in object permissions: its access comes from elsewhere (Edit Tasks).
    Task: {
      grants: [],
      fields: {
        Private__c: { read: [], edit: [], off: [0] },
        Subject: { read: [], edit: [] },
        Temp_Related_To__c: { read: [0, 2], edit: [2] },
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
    const text = fs.readFileSync(path.join(dir, 'model', 'model.json'), 'utf8');
    // What the app checks before the Model view draws a run.
    expect(modelResultsProblem(text)).toBeNull();
    return JSON.parse(text).items;
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

  it('says who can read and edit each field on its own, by name, through groups, muting and View All Fields', () => {
    const users = path.join(dir, 'users.csv');
    fs.writeFileSync(users, 'kind,name,users\nprofile,Center Director,3386\nprofile,Admin,12\npermissionSet,Lead_Editor,40\n');
    const items = run(
      `show_access(salesforce_access(${JSON.stringify(path.join(dir, 'leads.access.json'))}, PARAMS["fields"], users=${JSON.stringify(users)}))`,
      { fields: 'Lead' },
    );
    const counts = (security: string, profiles: [number, number], sets: [number, number], fieldOnly: number) => ({
      'Field-level security': security,
      'Profiles that can read': profiles[0], 'Profiles that can edit': profiles[1],
      'Permission sets and groups that can read': sets[0], 'Permission sets and groups that can edit': sets[1],
      'Granted without read on the object': fieldOnly, 'Active users (profiles)': 3398,
    });
    // On its own: Center Director's field edit needs Edit on Lead, Field_Only's field needs Read on Lead, and Lead Team can't edit Status (muted).
    expect(table(items, 'Who can read and edit each field')).toEqual([
      { Field: 'Lead.Company', ...counts('None: follows Lead', [2, 1], [3, 2], 0) },
      { Field: 'Lead.Ready_to_Convert__c', ...counts('Yes', [2, 1], [3, 2], 1) },
      { Field: 'Lead.Status', ...counts('Yes', [2, 1], [3, 1], 0) },
    ]);
    const fields = items.find((item) => item.title === 'Who can read and edit each field')!;
    const opened = (index: number) => fields.details![index]!.map((group) => [group.label, group.values]);
    expect(opened(0)[0]).toEqual(['No field-level security (a required or system field): it follows access to Lead', []]);
    expect(opened(1)).toContainEqual(['Granted it without read on Lead, so it opens only with another grant that has that read (1)', ['Field_Only (permission set)']]);
    expect(opened(2)).toEqual([
      ['Profiles that can edit it (1)', ['Admin']],
      ['Profiles that can only read it (1)', ['Center Director']],
      ['Permission sets that can edit it (1)', ['Lead Editor']],
      ['Permission sets that can only read it (1)', ['Read All (View All Fields)']],
      ['Permission set groups that can only read it (1)', ['Lead Team']],
    ]);

    expect(table(items, 'Who can see the most')).toEqual([
      { Holder: 'Admin', Kind: 'Profile', 'Fields it can read': 3, 'Fields it can edit': 3 },
      { Holder: 'Center Director', Kind: 'Profile', 'Fields it can read': 3, 'Fields it can edit': 0 },
      { Holder: 'Lead Editor', Kind: 'Permission set', 'Fields it can read': 3, 'Fields it can edit': 3 },
      { Holder: 'Lead Team', Kind: 'Permission set group', 'Fields it can read': 3, 'Fields it can edit': 2 },
      { Holder: 'Read All', Kind: 'Permission set', 'Fields it can read': 3, 'Fields it can edit': 0 },
    ]);
    const holders = items.find((item) => item.title === 'Who can see the most')!;
    // The largest group in words when it's most of them, after the ones listed.
    expect(holders.details![0]).toEqual([{ label: 'Can edit all 3 fields', values: [] }]);
    expect(holders.details![3]).toEqual([
      { label: 'Can only read (1)', values: ['Lead.Status'] },
      { label: 'Can edit the other 2 fields', values: [] },
    ]);

    expect(table(items, 'Sharing model: which records')).toEqual([{ Object: 'Lead', 'Sharing model (internal)': 'Private', External: 'Private' }]);
    expect(table(items, 'Every record: View All Data and Modify All Data')).toEqual([{ Holder: 'Admin', Kind: 'Profile', Permission: 'View All Data' }]);
    expect(table(items, 'Granted fields without read on the object')).toEqual([{ Holder: 'Field_Only', Kind: 'Permission set', 'Fields granted': 1 }]);
    expect(metric(items, 'Profiles that can read at least one')).toMatchObject({ value: 2 });
    expect(metric(items, 'Permission sets and groups that can read at least one')).toMatchObject({ value: 3 });

    // The notes are one list under a heading, the access file's limits last.
    const notes = items.filter((item) => item.kind === 'note');
    expect(notes[0].title).toBe('How to read this');
    expect(notes.slice(1).every((note) => note.title === undefined)).toBe(true);
    expect(notes.map((note) => note.text)).toContain('View All Data and Modify All Data read every object and see every record, whatever the sharing model. Which fields they see still follows field permissions, or View All Fields on the object.');
    expect(notes[notes.length - 1].text).toBe('Who can, not who does.');
  });

  it('keeps a field every profile turns off hidden, and lets a custom metadata type\'s fields follow the type', () => {
    const items = run(`show_access(salesforce_access(${JSON.stringify(path.join(dir, 'leads.access.json'))}, PARAMS["fields"]))`, { fields: 'Account.Rating, Holiday__mdt.Date__c' });
    const row = (security: string, profilesRead: number) => ({
      'Field-level security': security,
      'Profiles that can read': profilesRead, 'Profiles that can edit': 0,
      'Permission sets and groups that can read': 0, 'Permission sets and groups that can edit': 0,
      'Granted without read on the object': 0,
    });
    expect(table(items, 'Who can read and edit each field')).toEqual([
      { Field: 'Account.Rating', ...row('Yes', 0) },
      { Field: 'Holiday__mdt.Date__c', ...row('None: follows Holiday__mdt', 1) },
    ]);
    const fields = items.find((item) => item.title === 'Who can read and edit each field')!;
    expect(fields.details![0]!.map((group) => group.label)).toEqual(['No profile, permission set or group grants it']);
    expect(fields.details![1]![0]).toEqual({ label: 'Salesforce applies no field permissions to a custom metadata type\'s fields: it follows access to Holiday__mdt', values: [] });
  });

  it('counts only View All Data on an object no holder names in object permissions, and names whom its access decides for', () => {
    const items = run(`show_access(salesforce_access(${JSON.stringify(path.join(dir, 'leads.access.json'))}, PARAMS["fields"]))`, { fields: 'Lead.Status, Task' });
    const row = (object: string, security: string, counts: [number, number, number, number]) => ({
      'Object access': object, 'Field-level security': security,
      'Profiles that can read': counts[0], 'Profiles that can edit': counts[1],
      'Permission sets and groups that can read': counts[2], 'Permission sets and groups that can edit': counts[3],
      'Granted without read on the object': 0,
    });
    expect(table(items, 'Who can read and edit each field')).toEqual([
      { Field: 'Lead.Status', ...row('Object permissions', 'Yes', [2, 1, 3, 1]) },
      { Field: 'Task.Private__c', ...row('Set elsewhere', 'Yes', [0, 0, 0, 0]) },
      // Admin reads it through View All Data.
      { Field: 'Task.Subject', ...row('Set elsewhere', 'None: follows Task', [1, 0, 0, 0]) },
      { Field: 'Task.Temp_Related_To__c', ...row('Set elsewhere', 'Yes', [0, 0, 0, 0]) },
    ]);
    const fields = items.find((item) => item.title === 'Who can read and edit each field')!;
    expect(fields.details![3]!.map((group) => [group.label, group.values])).toEqual([
      ['Object permissions don\'t set access to Task: it comes from a parent object or a permission such as Edit Tasks, so only View All Data and Modify All Data count as reading it here', []],
      ['Their field permission reads it, and access to Task decides (3)', ['Center Director (profile)', 'Lead Editor (permission set)', 'Lead Team (permission set group)']],
    ]);

    const holders = items.find((item) => item.title === 'Who can see the most')!;
    expect(table(items, 'Who can see the most')!.map((entry) => entry.Holder)).toEqual(['Admin', 'Center Director', 'Lead Editor', 'Lead Team', 'Read All']);
    // Center Director's read off on Task.Private__c is decided; the other two Task fields are up to Task's access.
    expect(holders.details![1]).toEqual([
      { label: 'Can only read (1)', values: ['Lead.Status'] },
      { label: 'Can\'t read (1)', values: ['Task.Private__c'] },
      { label: 'Up to access to the object, which object permissions don\'t set (2)', values: ['Task.Subject', 'Task.Temp_Related_To__c'] },
    ]);
    expect(items.filter((item) => item.kind === 'note').map((item) => item.text)).toContain(
      'Object permissions don\'t set access to Task: it comes from a parent object or a permission such as Edit Tasks, which the metadata here doesn\'t settle. Their fields count only View All Data and Modify All Data as readers, and name whoever else a field permission reads them for.',
    );
  });

  it('names one field\'s holders without opening each holder, and the fields it doesn\'t know', () => {
    const items = run(`show_access(salesforce_access(${JSON.stringify(path.join(dir, 'leads.access.json'))}, PARAMS["fields"]))`, { fields: 'Lead.Status, Lead.Nope__c' });
    expect(items[0]).toMatchObject({ kind: 'note', text: expect.stringContaining('Not in the access file: Lead.Nope__c.') });
    expect(items.find((item) => item.title === 'Who can see the most')!.details).toBeUndefined();
    expect(table(items, 'Who can read and edit each field')![0]).not.toHaveProperty('Field-level security');
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
    // As the prompt writes it: fit_growth on fits the trend (an input is never None).
    const storage = run(`show_forecast(forecast_limits(${JSON.stringify(readings)}, PARAMS["limit"], growth=None if PARAMS["fit_growth"] else PARAMS["growth"], threshold=PARAMS["threshold"], months=PARAMS["months"]))`, { limit: 'DataStorageMB', fit_growth: true, growth: 2, threshold: 90, months: 24 });
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
