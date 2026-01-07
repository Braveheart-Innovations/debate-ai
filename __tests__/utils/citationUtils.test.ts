import {
  extractDomain,
  getFaviconUrl,
  buildCitationUrlMap,
  processMessageContentWithCitations,
  normalizeCitations,
  truncateText,
  findCitationByUrl,
} from '@/utils/citationUtils';
import type { Citation } from '@/types';

describe('citationUtils', () => {
  const mockCitations: Citation[] = [
    { index: 1, url: 'https://www.example.com/article1', title: 'Example Article 1', snippet: 'This is the first article' },
    { index: 2, url: 'https://docs.test.org/guide', title: 'Test Guide', snippet: 'A guide to testing', domain: 'docs.test.org' },
    { index: 3, url: 'https://blog.example.net/post', title: 'Blog Post', snippet: 'A blog post example' },
  ];

  describe('extractDomain', () => {
    it('extracts domain from valid URL', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com');
    });

    it('removes www prefix', () => {
      expect(extractDomain('https://www.test.org')).toBe('test.org');
    });

    it('handles URLs without www', () => {
      expect(extractDomain('https://docs.example.com')).toBe('docs.example.com');
    });

    it('returns original string for invalid URL', () => {
      expect(extractDomain('not-a-url')).toBe('not-a-url');
    });

    it('handles empty string', () => {
      expect(extractDomain('')).toBe('');
    });
  });

  describe('getFaviconUrl', () => {
    it('returns Google favicon service URL with default size', () => {
      const result = getFaviconUrl('example.com');
      expect(result).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32');
    });

    it('accepts custom size parameter', () => {
      const result = getFaviconUrl('example.com', 64);
      expect(result).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=64');
    });

    it('encodes special characters in domain', () => {
      const result = getFaviconUrl('test.com/path?query=1');
      expect(result).toContain('domain=test.com%2Fpath%3Fquery%3D1');
    });
  });

  describe('buildCitationUrlMap', () => {
    it('builds map from citations array', () => {
      const urlMap = buildCitationUrlMap(mockCitations);
      expect(urlMap.get(1)).toBe('https://www.example.com/article1');
      expect(urlMap.get(2)).toBe('https://docs.test.org/guide');
      expect(urlMap.get(3)).toBe('https://blog.example.net/post');
    });

    it('returns empty map for empty array', () => {
      const urlMap = buildCitationUrlMap([]);
      expect(urlMap.size).toBe(0);
    });
  });

  describe('processMessageContentWithCitations', () => {
    it('converts [n] references to markdown links', () => {
      const content = 'According to [1], this is true. See also [2].';
      const result = processMessageContentWithCitations(content, mockCitations);
      expect(result).toBe('According to [[1]](https://www.example.com/article1), this is true. See also [[2]](https://docs.test.org/guide).');
    });

    it('leaves unmatched references unchanged', () => {
      const content = 'Reference [1] exists but [99] does not.';
      const result = processMessageContentWithCitations(content, mockCitations);
      expect(result).toContain('[[1]](https://www.example.com/article1)');
      expect(result).toContain('[99]');
    });

    it('returns original content when no citations provided', () => {
      const content = 'No citations [1] here.';
      expect(processMessageContentWithCitations(content, [])).toBe(content);
    });

    it('handles content without citation references', () => {
      const content = 'No brackets here.';
      expect(processMessageContentWithCitations(content, mockCitations)).toBe(content);
    });
  });

  describe('normalizeCitations', () => {
    it('adds domain field from URL when missing', () => {
      const citations: Citation[] = [
        { index: 1, url: 'https://www.example.com/article', title: 'Test' },
      ];
      const normalized = normalizeCitations(citations);
      expect(normalized[0].domain).toBe('example.com');
    });

    it('preserves existing domain field', () => {
      const citations: Citation[] = [
        { index: 1, url: 'https://www.example.com/article', title: 'Test', domain: 'custom.domain' },
      ];
      const normalized = normalizeCitations(citations);
      expect(normalized[0].domain).toBe('custom.domain');
    });

    it('preserves all other citation properties', () => {
      const citations: Citation[] = [
        { index: 5, url: 'https://test.com', title: 'Title', snippet: 'Snippet text' },
      ];
      const normalized = normalizeCitations(citations);
      expect(normalized[0].index).toBe(5);
      expect(normalized[0].title).toBe('Title');
      expect(normalized[0].snippet).toBe('Snippet text');
    });
  });

  describe('truncateText', () => {
    it('returns original text when shorter than max length', () => {
      expect(truncateText('short', 10)).toBe('short');
    });

    it('returns original text when exactly max length', () => {
      expect(truncateText('exact', 5)).toBe('exact');
    });

    it('truncates and adds ellipsis when longer than max length', () => {
      expect(truncateText('this is too long', 10)).toBe('this is t…');
    });

    it('handles empty string', () => {
      expect(truncateText('', 10)).toBe('');
    });
  });

  describe('findCitationByUrl', () => {
    it('finds citation by exact URL match', () => {
      const citation = findCitationByUrl('https://docs.test.org/guide', mockCitations);
      expect(citation).toBeDefined();
      expect(citation?.index).toBe(2);
      expect(citation?.title).toBe('Test Guide');
    });

    it('returns undefined when URL not found', () => {
      const citation = findCitationByUrl('https://notfound.com', mockCitations);
      expect(citation).toBeUndefined();
    });

    it('returns undefined for empty citations array', () => {
      const citation = findCitationByUrl('https://example.com', []);
      expect(citation).toBeUndefined();
    });

    it('matches first citation when multiple have same URL', () => {
      const duplicateCitations: Citation[] = [
        { index: 1, url: 'https://same.com', title: 'First' },
        { index: 2, url: 'https://same.com', title: 'Second' },
      ];
      const citation = findCitationByUrl('https://same.com', duplicateCitations);
      expect(citation?.title).toBe('First');
    });
  });
});
