import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { AIConfigSheet } from '@/components/organisms/composer/AIConfigSheet';
import { getProviderModels } from '@/config/modelConfigs';

jest.mock('@/components/organisms/help/HelpModalHost', () => ({
  HelpModalHost: () => null,
}));

jest.mock('@/hooks/usePersonality', () => ({
  usePersonality: () => ({
    isCustomized: jest.fn().mockReturnValue(false),
  }),
}));

const claudeModels = (getProviderModels('claude') || []).filter((m) => !m.isDeprecated);

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  config: { providerId: 'claude', modelId: claudeModels[0]?.id || '', personalityId: 'default' },
  onChangeModel: jest.fn(),
  onChangePersonality: jest.fn(),
  onChangeParameters: jest.fn(),
  onRemove: jest.fn(),
  testID: 'ai-config',
};

describe('AIConfigSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the root page with model and personality rows', () => {
    const { getByText, getByTestId } = renderWithProviders(<AIConfigSheet {...baseProps} />);

    expect(getByText('Claude')).toBeTruthy();
    expect(getByTestId('ai-config-model-row')).toBeTruthy();
    expect(getByTestId('ai-config-personality-row')).toBeTruthy();
    expect(getByText('Remove from conversation')).toBeTruthy();
  });

  it('pushes the model page and commits a selection on tap, returning to root', () => {
    const { getByTestId, getByText, queryByTestId } = renderWithProviders(
      <AIConfigSheet {...baseProps} />
    );

    fireEvent.press(getByTestId('ai-config-model-row'));
    expect(getByText('Select Model')).toBeTruthy();

    const target = claudeModels[claudeModels.length - 1];
    fireEvent.press(getByTestId(`ai-config-model-list-option-${target.id}`));

    expect(baseProps.onChangeModel).toHaveBeenCalledWith(target.id);
    // Selection pops back to the root page
    expect(queryByTestId('ai-config-back')).toBeNull();
  });

  it('pushes the personality page and commits a selection on tap', () => {
    const { getByTestId, getByText } = renderWithProviders(<AIConfigSheet {...baseProps} />);

    fireEvent.press(getByTestId('ai-config-personality-row'));
    expect(getByText('Choose a Personality')).toBeTruthy();

    fireEvent.press(getByTestId('ai-config-personality-grid-option-bestie'));
    expect(baseProps.onChangePersonality).toHaveBeenCalledWith('bestie');
  });

  it('closes then removes when the destructive action is pressed', () => {
    const { getByText } = renderWithProviders(<AIConfigSheet {...baseProps} />);

    fireEvent.press(getByText('Remove from conversation'));
    expect(baseProps.onClose).toHaveBeenCalled();
    expect(baseProps.onRemove).toHaveBeenCalled();
  });

  it('shows the Advanced parameters row only when showAdvanced is set', () => {
    const { getByTestId, queryByTestId, rerender } = renderWithProviders(
      <AIConfigSheet {...baseProps} showAdvanced />
    );

    expect(getByTestId('ai-config-advanced-row')).toBeTruthy();

    rerender(<AIConfigSheet {...baseProps} />);
    expect(queryByTestId('ai-config-advanced-row')).toBeNull();
  });

  it('commits session parameter edits only on Save for This Session', () => {
    const { store, getByTestId, getByText, getByDisplayValue } = renderWithProviders(
      <AIConfigSheet {...baseProps} showAdvanced />
    );

    fireEvent.press(getByTestId('ai-config-advanced-row'));
    expect(getByText('Advanced Parameters')).toBeTruthy();
    // Stays in-sheet: no navigation, so the sheet was never closed.
    expect(baseProps.onClose).not.toHaveBeenCalled();

    // maxTokens is supported by every Claude model; default shows 2048.
    // Edits stay local until saved.
    fireEvent.changeText(getByDisplayValue('2048'), '4096');
    expect(baseProps.onChangeParameters).not.toHaveBeenCalled();

    fireEvent.press(getByText('Save for This Session'));
    expect(baseProps.onChangeParameters).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 4096 })
    );
    // Session-only saves never touch the global Model Defaults.
    expect(store.getState().settings.expertMode.claude).toBeUndefined();
  });

  it('marks the advanced row when session parameter overrides exist', () => {
    const config = {
      ...baseProps.config,
      parameters: { temperature: 0.7, maxTokens: 4096 },
    };
    const { getByTestId } = renderWithProviders(
      <AIConfigSheet {...baseProps} config={config} showAdvanced />
    );

    expect(getByTestId('ai-config-advanced-row-dot')).toBeTruthy();
  });

  it('saves to Model Defaults via the separate Save as Default button', () => {
    const { store, getByTestId, getByText, getByDisplayValue } = renderWithProviders(
      <AIConfigSheet {...baseProps} showAdvanced />
    );

    fireEvent.press(getByTestId('ai-config-advanced-row'));
    fireEvent.changeText(getByDisplayValue('2048'), '4096');

    fireEvent.press(getByText('Save as Default'));
    const saved = store.getState().settings.expertMode.claude;
    expect(saved?.enabled).toBe(true);
    expect(saved?.parameters).toMatchObject({ maxTokens: 4096 });
    // The session override becomes redundant once saved as the default.
    expect(baseProps.onChangeParameters).toHaveBeenCalledWith(undefined);
  });
});
