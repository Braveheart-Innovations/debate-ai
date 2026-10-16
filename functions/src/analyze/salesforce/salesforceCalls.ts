/**
 * The calls between components across the workspace: what a change's reach
 * follows past the components that refer to a field. Written into the
 * references index (`calls`) by `data_model`; the impact recipe walks them.
 *
 *  - Flows: a subflow, an Apex action (or Apex plugin), a platform event they
 *    publish (creating `<Event>__e` records), a Lightning component on a screen.
 *  - A platform event starts the flows and triggers that subscribe to it.
 *  - Apex and triggers: the org's own classes they name, events they publish
 *    (`EventBus.publish` in the file), flows they run (`Flow.Interview`).
 *  - Lightning components import Apex (`@salesforce/apex/…`); Aura and
 *    Visualforce name their controllers.
 *  - Quick actions run a flow or a component; Lightning pages host
 *    components, quick actions and flows.
 *
 * Only calls to components the workspace has are kept; a platform event is
 * kept as published even when nothing here subscribes (an integration may).
 * Static, like the index: a class picked by name at run time isn't seen.
 */
import { componentKey, type CallKind, type SalesforceCall } from '../contract/services/analyze/diagrams/salesforceReferences';
import type { SalesforceSourceFile } from './SalesforceMetadataService';
import { baseName, lineFinder, placeOf, tagValues, withoutComments } from './salesforceSourceText';

interface Known {
  flows: Map<string, string>;
  apex: Map<string, string>;
  components: Map<string, string>;
  quickActions: Map<string, string>;
}

/** Lower-case name → name, for matching names written in any case. */
function byLowerCase(names: Iterable<string>): Map<string, string> {
  return new Map([...names].map((name) => [name.toLowerCase(), name]));
}

/** The components the workspace has, by kind; hidden package classes count, so calls to them show. */
function knownComponents(sourceFiles: SalesforceSourceFile[]): Known {
  const flows: string[] = [];
  const apex: string[] = [];
  const components: string[] = [];
  const quickActions: string[] = [];
  for (const file of sourceFiles) {
    const place = placeOf(file.path);
    if (!place) continue;
    if (place.folder === 'flows' && /\.flow(-meta\.xml)?$/i.test(place.rest)) flows.push(baseName(place.rest).replace(/\.flow$/i, ''));
    if (place.folder === 'classes' && /\.cls$/i.test(place.rest)) apex.push(baseName(place.rest));
    if (place.folder === 'lwc' || place.folder === 'aura') components.push(place.rest.split('/')[0]);
    if (place.folder === 'quickActions') quickActions.push(baseName(place.rest).replace(/\.quickAction$/i, ''));
  }
  return { flows: byLowerCase(flows), apex: byLowerCase(apex), components: byLowerCase(components), quickActions: byLowerCase(quickActions) };
}

/** A custom component's own name: `c:datatable` and `datatable` are the org's `datatable`; `ns:x` is a package's. */
function ownComponentName(name: string): string | undefined {
  const match = name.trim().match(/^(?:c[:_]{1,2})?([A-Za-z][A-Za-z0-9_]*)$/);
  return match?.[1];
}

export function buildSalesforceCalls(sourceFiles: SalesforceSourceFile[], fileId: (file: SalesforceSourceFile) => number): SalesforceCall[] {
  const known = knownComponents(sourceFiles);
  const calls: SalesforceCall[] = [];
  const seen = new Set<string>();

  for (const file of sourceFiles) {
    const place = placeOf(file.path);
    const content = file.content;
    if (!place || !content || content.trim() === '(hidden)') continue;
    const { folder, rest } = place;
    const lineAt = lineFinder(content);
    const add = (from: string, to: string | undefined, how: CallKind, offset: number) => {
      if (!to || from === to) return;
      const key = `${from}|${to}|${how}`;
      if (seen.has(key)) return;
      seen.add(key);
      calls.push({ from, to, how, file: fileId(file), line: lineAt(offset) });
    };
    const publish = (from: string, event: string, offset: number) => add(from, componentKey('event', event), 'publishes', offset);
    const flowKey = (name: string | undefined) => (name && known.flows.get(name.toLowerCase()) ? componentKey('flow', known.flows.get(name.toLowerCase())!) : undefined);
    const apexKey = (name: string | undefined) => (name && known.apex.get(name.toLowerCase()) ? componentKey('apex', known.apex.get(name.toLowerCase())!) : undefined);
    const componentNamed = (name: string | undefined) => {
      const own = name ? ownComponentName(name) : undefined;
      const found = own ? known.components.get(own.toLowerCase()) : undefined;
      return found ? componentKey('lightningComponent', found) : undefined;
    };

    if (folder === 'flows') {
      if (!/\.flow(-meta\.xml)?$/i.test(rest)) continue;
      const self = componentKey('flow', baseName(rest).replace(/\.flow$/i, ''));
      const start = content.match(/<start>([\s\S]*?)<\/start>/);
      if (start && /<triggerType>PlatformEvent<\/triggerType>/.test(start[1])) {
        const event = start[1].match(/<object>([^<]+)<\/object>/)?.[1]?.trim();
        if (event) add(componentKey('event', event), self, 'starts', start.index ?? 0);
      }
      for (const block of content.matchAll(/<subflows>([\s\S]*?)<\/subflows>/g)) add(self, flowKey(block[1].match(/<flowName>([^<]+)<\/flowName>/)?.[1]?.trim()), 'subflow', block.index ?? 0);
      for (const block of content.matchAll(/<actionCalls>([\s\S]*?)<\/actionCalls>/g)) {
        if (!/<actionType>apex<\/actionType>/.test(block[1])) continue;
        add(self, apexKey(block[1].match(/<actionName>([^<]+)<\/actionName>/)?.[1]?.trim()), 'apex', block.index ?? 0);
      }
      for (const block of content.matchAll(/<apexPluginCalls>([\s\S]*?)<\/apexPluginCalls>/g)) add(self, apexKey(block[1].match(/<apexClass>([^<]+)<\/apexClass>/)?.[1]?.trim()), 'apex', block.index ?? 0);
      for (const block of content.matchAll(/<recordCreates>([\s\S]*?)<\/recordCreates>/g)) {
        const object = block[1].match(/<object>([^<]+)<\/object>/)?.[1]?.trim();
        if (object && /__e$/i.test(object)) publish(self, object, block.index ?? 0);
      }
      for (const name of tagValues(content, 'extensionName')) add(self, componentNamed(name.value), 'hosts', name.offset);
      continue;
    }

    if (folder === 'classes' || folder === 'triggers') {
      if (!/\.(cls|trigger)$/i.test(rest)) continue;
      const name = baseName(rest);
      const self = componentKey(folder === 'triggers' ? 'trigger' : 'apex', name);
      const code = withoutComments(content);
      if (folder === 'triggers') {
        const on = code.match(/\btrigger\s+\w+\s+on\s+(\w+__e)\b/i);
        if (on) add(componentKey('event', on[1]), self, 'starts', on.index ?? 0);
      }
      if (/\bEventBus\.publish\s*\(/.test(code)) {
        for (const match of code.matchAll(/\bnew\s+([A-Za-z][A-Za-z0-9_]*__e)\s*\(/g)) publish(self, match[1], match.index ?? 0);
      }
      for (const match of code.matchAll(/\bFlow\.Interview\.([A-Za-z][A-Za-z0-9_]*)/g)) {
        if (match[1] !== 'createInterview') add(self, flowKey(match[1]), 'runs', match.index ?? 0);
      }
      for (const match of code.matchAll(/\bFlow\.Interview\.createInterview\(\s*'([^']+)'/g)) add(self, flowKey(match[1]), 'runs', match.index ?? 0);
      for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
        const target = known.apex.get(match[1].toLowerCase());
        if (target && target.toLowerCase() !== name.toLowerCase()) add(self, componentKey('apex', target), 'calls', match.index ?? 0);
      }
      continue;
    }

    if (folder === 'lwc' || folder === 'aura') {
      const self = componentKey('lightningComponent', rest.split('/')[0]);
      for (const match of content.matchAll(/@salesforce\/apex\/([A-Za-z_][A-Za-z0-9_]*)\./g)) add(self, apexKey(match[1]), 'imports', match.index ?? 0);
      for (const match of content.matchAll(/\bcontroller\s*=\s*"([^"]+)"/g)) add(self, apexKey(match[1].split('.').pop()), 'calls', match.index ?? 0);
      continue;
    }

    if (folder === 'pages' || folder === 'components') {
      const self = componentKey('visualforce', baseName(rest));
      for (const match of content.matchAll(/\b(?:controller|extensions)\s*=\s*"([^"]+)"/g)) {
        for (const name of match[1].split(',')) add(self, apexKey(name.trim()), 'calls', match.index ?? 0);
      }
      continue;
    }

    if (folder === 'quickActions') {
      const self = componentKey('quickAction', baseName(rest).replace(/\.quickAction$/i, ''));
      for (const value of tagValues(content, 'flowDefinition')) add(self, flowKey(value.value), 'runs', value.offset);
      for (const tag of ['lightningWebComponent', 'lightningComponent']) {
        for (const value of tagValues(content, tag)) add(self, componentNamed(value.value), 'runs', value.offset);
      }
      continue;
    }

    if (folder === 'flexipages') {
      const self = componentKey('flexipage', baseName(rest).replace(/\.flexipage$/i, ''));
      for (const value of tagValues(content, 'componentName')) add(self, componentNamed(value.value), 'hosts', value.offset);
      for (const value of tagValues(content, 'value')) {
        const action = known.quickActions.get(value.value.toLowerCase());
        if (action) add(self, componentKey('quickAction', action), 'hosts', value.offset);
        else add(self, flowKey(value.value), 'hosts', value.offset);
      }
    }
  }

  return calls.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.how.localeCompare(b.how));
}
