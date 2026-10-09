import { parseFile } from '../fileParser';
import { executeReadFileTool } from '../executeReadFileTool';
import type { SandboxFiles } from '../sandboxFiles';

jest.mock('../fileParser', () => ({
  parseFile: jest.fn(),
}));

const files = {} as SandboxFiles;
const mockedParseFile = parseFile as jest.MockedFunction<typeof parseFile>;

describe('executeReadFileTool', () => {
  beforeEach(() => {
    mockedParseFile.mockReset();
  });

  it('reads paged output file content without the legacy 1500-character summary cap', async () => {
    const longContent = `${'a'.repeat(1800)}TAIL_MARKER`;
    mockedParseFile.mockResolvedValue({
      format: 'text',
      filename: 'findings.json',
      content: longContent,
      contentOffset: 0,
      contentEnd: longContent.length,
      totalChars: longContent.length,
      truncated: false,
    });

    const result = await executeReadFileTool(files, 'tool_1', {
      path: '/output/_all_findings.json',
      format: 'text',
      offset: 0,
      max_chars: 4000,
    });

    expect(result.success).toBe(true);
    expect(mockedParseFile).toHaveBeenCalledWith(files, '/output/_all_findings.json', expect.objectContaining({
      format: 'text',
      offset: 0,
      maxChars: 4000,
    }));
    expect(result.content).toContain('Content slice: chars 0-1811 of 1811');
    expect(result.content).toContain('TAIL_MARKER');
  });

  it('rejects paths outside exposed session directories', async () => {
    const result = await executeReadFileTool(files, 'tool_2', {
      path: '/private/secret.txt',
      format: 'text',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('/uploads/');
    expect(mockedParseFile).not.toHaveBeenCalled();
  });
});
