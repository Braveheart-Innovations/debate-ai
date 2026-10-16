/**
 * Reading Salesforce source text: offsets to lines, comments blanked, where a
 * file sits in the metadata folders, XML tag values. Shared by the references
 * index and the calls between components.
 */

/** A file's lines, found once, for turning an offset into a line number. */
export function lineFinder(content: string): (offset: number) => number {
  let starts: number[] | null = null;
  return (offset: number) => {
    if (!starts) {
      starts = [0];
      for (let index = content.indexOf('\n'); index >= 0; index = content.indexOf('\n', index + 1)) starts.push(index + 1);
    }
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

/** Comments blanked out, keeping every offset and line where it was. */
export function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Where a file sits: its metadata folder and the rest of its path under the package directory. */
export function placeOf(path: string): { folder: string; rest: string } | null {
  const match = path.replace(/\\/g, '/').match(/(?:^|\/)(classes|triggers|flows|objects|layouts|flexipages|quickActions|pathAssistants|workflows|assignmentRules|autoResponseRules|escalationRules|duplicateRules|matchingRules|sharingRules|reports|reportTypes|email|lwc|aura|pages|components|permissionsets|profiles|tabs)\/(.+)$/);
  return match ? { folder: match[1], rest: match[2] } : null;
}

/** A file's member name: `Lead.Block_Dupes` for `duplicateRules/Lead.Block_Dupes.duplicateRule-meta.xml`. */
export function baseName(rest: string): string {
  return rest.split('/').pop()!.replace(/-meta\.xml$/i, '').replace(/\.[A-Za-z]+$/, '');
}

/** Values of an XML tag, with the offset of each value. */
export function tagValues(content: string, tag: string): Array<{ value: string; offset: number }> {
  const found: Array<{ value: string; offset: number }> = [];
  const pattern = new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'g');
  for (let match = pattern.exec(content); match; match = pattern.exec(content)) found.push({ value: match[1], offset: match.index });
  return found;
}
