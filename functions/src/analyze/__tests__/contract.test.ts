import type { Message, MessageMetadata, ToolResultProvenance, AnalyzeTeamRunSummary } from '../contract/types';

// Compile-time guard: the synced contract exposes the shapes the server loop
// writes. (Runtime assertion only keeps jest from reporting an empty suite.)
describe('Analyze data contract', () => {
  it('types the persisted message shape', () => {
    const provenance: ToolResultProvenance | undefined = undefined;
    const team: AnalyzeTeamRunSummary[] = [];
    const metadata: MessageMetadata = {};
    const message: Message = { id: 'm1', sender: 'Claude', senderType: 'ai', content: 'hi', timestamp: 1, metadata };
    expect({ message, provenance, team }).toBeDefined();
  });
});
