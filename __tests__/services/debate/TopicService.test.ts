import { TopicService } from '@/services/debate/TopicService';
import { DEBATE_SETUP_CONFIG } from '@/config/debate/debateSetupConfig';

describe('TopicService', () => {
  it('normalizes questions into declarative motions', () => {
    const normalized = TopicService.normalizeMotion('Should we ban cars?');
    expect(normalized).toBe('We should ban cars.');
  });

  it('validates custom topics and suggests improvements', () => {
    const result = TopicService.validateCustomTopic('AI');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(DEBATE_SETUP_CONFIG.VALIDATION_MESSAGES.TOPIC_TOO_SHORT);

    const valid = TopicService.validateCustomTopic('Artificial intelligence should be regulated globally.');
    expect(valid.isValid).toBe(true);
  });

  it('estimates duration based on topic length', () => {
    const short = TopicService.getEstimatedDuration('AI ethics');
    const long = TopicService.getEstimatedDuration('Artificial intelligence should be regulated globally to protect consumers and innovation.');
    expect(short).toBe(DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.SHORT_TOPIC);
    expect(long).toBeGreaterThan(short);
  });
});
