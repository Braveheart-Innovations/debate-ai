import { executeWriteOutputFileTool } from '../executeWriteOutputFileTool';

function decodeBuffer(value: ArrayBuffer): string {
  return new TextDecoder().decode(value);
}

describe('executeWriteOutputFileTool', () => {
  it('writes text content under /output', async () => {
    const sandbox = {
      mountFile: jest.fn().mockResolvedValue('/output/site/index.html'),
      readFile: jest.fn(),
    };

    const result = await executeWriteOutputFileTool(sandbox, 'tool_1', {
      path: '/output/site/index.html',
      content: '<html>hello</html>',
    });

    expect(result.success).toBe(true);
    expect(sandbox.mountFile).toHaveBeenCalledWith(
      'index.html',
      expect.any(ArrayBuffer),
      '/output/site/index.html',
    );
    expect(decodeBuffer(sandbox.mountFile.mock.calls[0][1])).toBe('<html>hello</html>');
    expect(result.htmlOutputs).toEqual([
      { filename: 'site/index.html', content: '<html>hello</html>' },
    ]);
    expect(result.dataOutputs).toBeUndefined();
  });

  it('appends content to an existing output file', async () => {
    const sandbox = {
      mountFile: jest.fn().mockResolvedValue('/output/site/styles.css'),
      readFile: jest.fn().mockResolvedValue(new TextEncoder().encode('body{}').buffer),
    };

    const result = await executeWriteOutputFileTool(sandbox, 'tool_2', {
      path: '/output/site/styles.css',
      content: '\nmain{}',
      append: true,
    });

    expect(result.success).toBe(true);
    expect(sandbox.readFile).toHaveBeenCalledWith('/output/site/styles.css');
    expect(decodeBuffer(sandbox.mountFile.mock.calls[0][1])).toBe('body{}\nmain{}');
    expect(result.dataOutputs?.[0]).toMatchObject({
      filename: 'site/styles.css',
      size: 13,
    });
  });

  it('rejects writes outside /output', async () => {
    const sandbox = {
      mountFile: jest.fn(),
      readFile: jest.fn(),
    };

    const result = await executeWriteOutputFileTool(sandbox, 'tool_3', {
      path: '/uploads/report.html',
      content: '<html></html>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('/output');
    expect(sandbox.mountFile).not.toHaveBeenCalled();
  });

  it('refuses to overwrite files with history-compaction placeholders', async () => {
    const sandbox = {
      mountFile: jest.fn(),
      readFile: jest.fn().mockResolvedValue(new TextEncoder().encode('body { color: red; }').buffer),
    };

    const result = await executeWriteOutputFileTool(sandbox, 'tool_4', {
      path: '/output/site/styles.css',
      content: '[write_output_file content omitted from history: 8,000 characters to /output/site/styles.css.] The content was already written.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('history-compaction placeholder');
    expect(result.content).toContain('Refused to write');
    expect(result.content).toContain('Existing file size remains');
    expect(result.content).toContain('read_file(path="/output/site/styles.css"');
    expect(sandbox.readFile).toHaveBeenCalledWith('/output/site/styles.css');
    expect(sandbox.mountFile).not.toHaveBeenCalled();
  });

  it('refuses omitted execute_python placeholders as file content', async () => {
    const sandbox = {
      mountFile: jest.fn(),
      readFile: jest.fn().mockRejectedValue(new Error('missing')),
    };

    const result = await executeWriteOutputFileTool(sandbox, 'tool_5', {
      path: '/output/site/index.html',
      content: '[execute_python code omitted from history: 12,000 characters.]',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('history-compaction placeholder');
    expect(sandbox.mountFile).not.toHaveBeenCalled();
  });
});
