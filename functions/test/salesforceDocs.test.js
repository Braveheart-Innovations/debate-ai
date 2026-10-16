const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  canonicalizeUrl,
  inferSalesforceDocumentationStatus,
  officialDocRetrievalPlan,
  buildBm25CorpusStats,
  bm25ChunkScore,
  refreshCoverageError,
  selectionIsAliasRouted,
  extractRenderedHelpArticle,
  salesforceReleaseLabelForVersion,
  canonicalHelpArticleUrl,
  SALESFORCE_DOC_TOPICS,
  SALESFORCE_DOC_PDF_SOURCES,
  SALESFORCE_DOC_TOPIC_ALIASES,
} = require('../lib/salesforceDocsIndex');

describe('topic catalog hygiene', () => {
  it('has unique topic ids', () => {
    const ids = SALESFORCE_DOC_TOPICS.map((topic) => topic.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('every seed URL is an official https Salesforce URL and canonicalizes to itself', () => {
    for (const topic of SALESFORCE_DOC_TOPICS) {
      assert.ok(topic.seedUrls.length > 0, `${topic.id} has no seeds`);
      for (const seedUrl of topic.seedUrls) {
        const canonical = canonicalizeUrl(seedUrl);
        assert.ok(canonical, `${topic.id} seed is not an official Salesforce URL: ${seedUrl}`);
        assert.equal(canonical, seedUrl, `${topic.id} seed is not pre-canonicalized: ${seedUrl}`);
      }
    }
  });

  it('every PDF source references existing topics and the shared base URL', () => {
    const topicIds = new Set(SALESFORCE_DOC_TOPICS.map((topic) => topic.id));
    const pdfIds = SALESFORCE_DOC_PDF_SOURCES.map((source) => source.id);
    assert.equal(new Set(pdfIds).size, pdfIds.length, 'duplicate PDF source ids');
    for (const source of SALESFORCE_DOC_PDF_SOURCES) {
      assert.ok(source.topicIds.length > 0, `${source.id} maps to no topics`);
      for (const topicId of source.topicIds) {
        assert.ok(topicIds.has(topicId), `${source.id} references missing topic ${topicId}`);
      }
      assert.match(source.url, /^https:\/\/resources\.docs\.salesforce\.com\//, `${source.id} url off-pattern`);
    }
  });

  it('every alias target is an existing topic id', () => {
    const topicIds = new Set(SALESFORCE_DOC_TOPICS.map((topic) => topic.id));
    for (const [alias, targets] of Object.entries(SALESFORCE_DOC_TOPIC_ALIASES)) {
      assert.ok(targets.length > 0, `alias ${alias} has no targets`);
      for (const target of targets) {
        assert.ok(topicIds.has(target), `alias ${alias} references missing topic ${target}`);
      }
    }
  });

  it('covers the solution-architect domains', () => {
    const categories = new Set(SALESFORCE_DOC_TOPICS.map((topic) => topic.category));
    for (const required of ['architecture', 'identity', 'devops', 'omnistudio', 'agentforce', 'experience_cloud', 'field_service', 'analytics']) {
      assert.ok(categories.has(required), `no topics in category ${required}`);
    }
    assert.ok(SALESFORCE_DOC_TOPICS.length >= 70, `expected >=70 topics, got ${SALESFORCE_DOC_TOPICS.length}`);
    assert.ok(SALESFORCE_DOC_PDF_SOURCES.length >= 20, `expected >=20 PDF sources, got ${SALESFORCE_DOC_PDF_SOURCES.length}`);
  });
});

describe('selectionIsAliasRouted', () => {
  it('routes only when a selected record belongs to an aliased indexed topic', () => {
    const aliasIds = ['apex-governor-limits', 'soql-query-selectivity'];
    assert.equal(
      selectionIsAliasRouted([{ topicIds: ['flow-fault-paths'] }, { topicIds: ['apex-governor-limits'] }], aliasIds),
      true
    );
    assert.equal(
      selectionIsAliasRouted([{ topicIds: ['flow-fault-paths'] }, { topicIds: ['lightning-security'] }], aliasIds),
      false,
      'token-scavenged selections must not count as alias-routed'
    );
    assert.equal(selectionIsAliasRouted([], aliasIds), false);
  });
});

describe('canonicalizeUrl', () => {
  it('strips tracking params but preserves real params starting with d/n', () => {
    const canonical = canonicalizeUrl(
      'https://developer.salesforce.com/page?docId=abc&deliverable=apexcode&utm_source=x&d=70130000000sdFc&nc=1&cmpid=7&trkid=9&mc_eid=4'
    );
    const url = new URL(canonical);
    assert.equal(url.searchParams.get('docId'), 'abc');
    assert.equal(url.searchParams.get('deliverable'), 'apexcode');
    for (const stripped of ['utm_source', 'd', 'nc', 'cmpid', 'trkid', 'mc_eid']) {
      assert.equal(url.searchParams.get(stripped), null, `expected ${stripped} to be stripped`);
    }
  });

  it('clears fragments and lowercases the host', () => {
    const canonical = canonicalizeUrl('https://Developer.Salesforce.com/docs/page.htm#section-3');
    assert.equal(canonical, 'https://developer.salesforce.com/docs/page.htm');
  });

  it('rejects non-official and non-https URLs', () => {
    assert.equal(canonicalizeUrl('https://example.com/docs'), null);
    assert.equal(canonicalizeUrl('https://salesforce.com.evil.example/docs'), null);
    assert.equal(canonicalizeUrl('http://developer.salesforce.com/docs/page.htm'), null);
  });
});

describe('inferSalesforceDocumentationStatus', () => {
  it('flags genuine preview language', () => {
    assert.equal(
      inferSalesforceDocumentationStatus('This feature is currently in beta and subject to change.'),
      'preview'
    );
    assert.equal(
      inferSalesforceDocumentationStatus('Available as a Developer Preview in scratch orgs.'),
      'preview'
    );
    assert.equal(
      inferSalesforceDocumentationStatus(
        "These features are in pilot and don't become generally available unless Salesforce announces otherwise."
      ),
      'preview'
    );
  });

  it('does not flag GA pages that carry safe-harbor boilerplate as preview', () => {
    const gaPageWithSafeHarbor = [
      "Salesforce Winter '26 Release Notes. This feature is generally available in all editions.",
      'This document contains forward-looking statements about unreleased services or features that',
      "don't become generally available on time or at all.",
      'Customers should make purchase decisions based on features that are currently available.',
    ].join(' ');
    assert.equal(inferSalesforceDocumentationStatus(gaPageWithSafeHarbor), 'ga');
  });

  it('classifies GA and neutral text', () => {
    assert.equal(inferSalesforceDocumentationStatus('This feature is generally available.'), 'ga');
    assert.equal(inferSalesforceDocumentationStatus('Use SOQL to query records in Apex.'), 'unknown');
  });
});

describe('officialDocRetrievalPlan', () => {
  const atlasUrl = 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm';
  const releaseNotesUrl = 'https://help.salesforce.com/s/articleView?id=release-notes.rn_apex.htm&language=en_US&type=5';
  const helpArticleUrl = 'https://help.salesforce.com/s/articleView?id=sf.flow_concepts.htm&type=5';

  it('routes atlas developer docs through the JSON API', () => {
    assert.equal(officialDocRetrievalPlan(atlasUrl), 'developer_api');
    assert.equal(officialDocRetrievalPlan(atlasUrl, { allowRendering: false }), 'developer_api');
  });

  it('renders release-notes help articles only when rendering is allowed', () => {
    assert.equal(officialDocRetrievalPlan(releaseNotesUrl), 'rendered_help');
    assert.equal(officialDocRetrievalPlan(releaseNotesUrl, { allowRendering: false }), 'help_metadata');
  });

  it('renders every help article, including Knowledge articles, at build time only', () => {
    const knowledgeUrl = 'https://help.salesforce.com/s/articleView?id=003834041&language=en_US&type=1';
    for (const url of [helpArticleUrl, knowledgeUrl]) {
      assert.equal(officialDocRetrievalPlan(url), 'rendered_help');
      assert.equal(officialDocRetrievalPlan(url, { allowRendering: false }), 'help_metadata');
    }
  });

  it('serves non-help pages as raw HTML', () => {
    assert.equal(
      officialDocRetrievalPlan('https://developer.salesforce.com/docs/platform/lwc/guide/apex-security.html'),
      'raw_html'
    );
    assert.equal(
      officialDocRetrievalPlan('https://architect.salesforce.com/decision-guides/trigger-automation'),
      'raw_html'
    );
  });
});

describe('extractRenderedHelpArticle', () => {
  it('drops site banners and the breadcrumb before the title, and the feedback widget after the body', () => {
    const raw = [
      'Agentforce is temporarily unavailable. Please try again later.',
      'Read More',
      'Important Advisory: iOS Update Impacting CG Mobile Application',
      'Close',
      'Get Started with Salesforce',
      'Show Table of Contents',
      'You are here:',
      'SALESFORCE HELP',
      'DOCS',
      'GET STARTED WITH SALESFORCE',
      'Data and File Storage Allocations',
      'Storage is divided into two categories.',
      'SEE ALSO',
      'Salesforce Editions',
      'Loading',
      'DID THIS ARTICLE SOLVE YOUR ISSUE?',
      'Let us know so we can improve!',
      'Yes',
    ].join('\n');
    const article = extractRenderedHelpArticle(raw, 'Data and File Storage Allocations');
    assert.match(article.text, /^Data and File Storage Allocations\nStorage is divided into two categories\./);
    assert.doesNotMatch(article.text, /Advisory|Agentforce|You are here|DID THIS ARTICLE|Let us know/i);
    assert.match(article.header, /GET STARTED WITH SALESFORCE/);
  });

  it('keeps a Knowledge article from its title, with no breadcrumb', () => {
    const raw = 'Permissions in Profiles Retirement Cancelled\nPublish Date: Jun 6, 2026\nDescription\nThis enforcement has now been cancelled.\nLoading\nDID THIS ARTICLE SOLVE YOUR ISSUE?\nYes';
    const article = extractRenderedHelpArticle(raw, 'Permissions in Profiles Retirement Cancelled');
    assert.equal(article.header, '');
    assert.match(article.text, /^Permissions in Profiles Retirement Cancelled\nPublish Date: Jun 6, 2026/);
    assert.doesNotMatch(article.text, /DID THIS ARTICLE/);
  });

  it('matches the title across curly and straight quotes', () => {
    const raw = "You are here:\nDOCS\nStrengthen Your Data's Security\nBody text.";
    const article = extractRenderedHelpArticle(raw, 'Strengthen Your Data\u2019s Security');
    assert.match(article.text, /^Strengthen Your Data's Security\nBody text\./);
  });
});

describe('salesforceReleaseLabelForVersion', () => {
  it('maps release numbers to their season', () => {
    assert.equal(salesforceReleaseLabelForVersion('264'), "Winter '27");
    assert.equal(salesforceReleaseLabelForVersion('262'), "Summer '26");
    assert.equal(salesforceReleaseLabelForVersion('266'), "Spring '27");
    assert.equal(salesforceReleaseLabelForVersion('208'), "Summer '17");
    assert.equal(salesforceReleaseLabelForVersion('248'), "Spring '24");
  });

  it('returns undefined for anything that is not a release number', () => {
    assert.equal(salesforceReleaseLabelForVersion(undefined), undefined);
    assert.equal(salesforceReleaseLabelForVersion('263'), undefined);
    assert.equal(salesforceReleaseLabelForVersion('62.0'), undefined);
  });
});

describe('canonicalHelpArticleUrl', () => {
  it('normalizes relative and absolute article links to id, language and type', () => {
    assert.equal(
      canonicalHelpArticleUrl('/s/articleView?id=platform.users_unlock.htm&language=en_US&type=5'),
      'https://help.salesforce.com/s/articleView?id=platform.users_unlock.htm&language=en_US&type=5',
    );
    assert.equal(
      canonicalHelpArticleUrl('https://help.salesforce.com/s/articleView?id=005167035&type=1'),
      'https://help.salesforce.com/s/articleView?id=005167035&language=en_US&type=1',
    );
  });

  it('rejects other hosts, other languages, and links without an id', () => {
    assert.equal(canonicalHelpArticleUrl('https://example.com/s/articleView?id=x.htm'), null);
    assert.equal(canonicalHelpArticleUrl('/s/articleView?id=x.htm&language=ja'), null);
    assert.equal(canonicalHelpArticleUrl('articleView?nocache=https%3A%2F%2Fhelp.salesforce.com'), null);
  });
});

describe('BM25 chunk scoring', () => {
  function statsWith(totalChunks, avgChunkLength) {
    return { totalChunks, avgChunkLength, dfByToken: new Map() };
  }

  it('computes corpus stats in one pass over index chunks', () => {
    const index = {
      records: [
        { textChunks: [{ text: 'a'.repeat(100), contentLength: 100 }, { text: 'b'.repeat(300), contentLength: 300 }] },
        { textChunks: [{ text: 'c'.repeat(200), contentLength: 200 }] },
        {},
      ],
    };
    const stats = buildBm25CorpusStats(index);
    assert.equal(stats.totalChunks, 3);
    assert.equal(stats.avgChunkLength, 200);
    assert.equal(stats.dfByToken.size, 0);
  });

  it('weights rare tokens above common tokens', () => {
    const stats = statsWith(100, 100);
    const text = 'apex governor limits apply to synchronous transactions';
    const rare = bm25ChunkScore(text, text.length, ['governor'], stats, () => 2);
    const common = bm25ChunkScore(text, text.length, ['governor'], stats, () => 90);
    assert.ok(rare > common, `expected rare-token score ${rare} > common-token score ${common}`);
  });

  it('saturates term frequency', () => {
    const stats = statsWith(100, 60);
    const once = 'governor limits apply here in this transaction context and elsewhere';
    const fourTimes = 'governor governor governor governor limits apply in transaction context';
    const scoreOnce = bm25ChunkScore(once, once.length, ['governor'], stats, () => 5);
    const scoreFour = bm25ChunkScore(fourTimes, fourTimes.length, ['governor'], stats, () => 5);
    assert.ok(scoreFour > scoreOnce, 'more occurrences must score higher');
    assert.ok(scoreFour < scoreOnce * 4, 'term frequency must saturate, not scale linearly');
  });

  it('normalizes for chunk length', () => {
    const stats = statsWith(100, 100);
    const shortText = 'governor limits';
    const longText = `governor limits ${'padding '.repeat(60)}`;
    const shortScore = bm25ChunkScore(shortText, 50, ['governor'], stats, () => 5);
    const longScore = bm25ChunkScore(longText, 400, ['governor'], stats, () => 5);
    assert.ok(shortScore > longScore, 'same tf in a shorter chunk must score higher');
  });

  it('returns 0 on an empty corpus', () => {
    assert.equal(bm25ChunkScore('governor', 8, ['governor'], statsWith(0, 0), () => 0), 0);
  });
});

describe('refreshCoverageError', () => {
  function makeRecord(overrides = {}) {
    return {
      id: 'r',
      topicIds: ['apex-governor-limits'],
      title: 'Doc',
      url: 'https://developer.salesforce.com/docs/page.htm',
      domain: 'developer.salesforce.com',
      sourceType: 'developer_doc',
      status: 'ga',
      retrievedAt: new Date().toISOString(),
      responseHash: 'hash',
      contentQuality: 'full_text',
      contentLength: 1000,
      excerpt: 'excerpt',
      keywords: [],
      warnings: [],
      discoverySource: 'seed',
      confidenceImpact: 'supports',
      ...overrides,
    };
  }

  function makeIndex(records) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourcePolicy: { allowedHostPattern: '*.salesforce.com', storagePath: 'salesforce-docs/index-v1.json' },
      topics: [],
      records,
      failures: [],
      warnings: [],
    };
  }

  // Sized against the raised gates (dev >=110, full-text >=185, pdf >=15).
  const passingRecords = [
    ...Array.from({ length: 200 }, (_, i) => makeRecord({ id: `dev-${i}` })),
    ...Array.from({ length: 16 }, (_, i) => makeRecord({
      id: `pdf-${i}`,
      domain: 'resources.docs.salesforce.com',
      sourceType: 'pdf_guide',
      sourceFormat: 'pdf',
    })),
  ];

  it('accepts an index meeting all gates', () => {
    assert.equal(refreshCoverageError(makeIndex(passingRecords)), null);
  });

  it('rejects too few developer.salesforce.com records', () => {
    const records = passingRecords.map((record, i) =>
      i < 100 ? { ...record, domain: 'help.salesforce.com' } : record
    );
    assert.match(refreshCoverageError(makeIndex(records)), /developer\.salesforce\.com/);
  });

  it('rejects too few full-text records', () => {
    const records = passingRecords.map((record) => ({ ...record, contentLength: 100 }));
    assert.match(refreshCoverageError(makeIndex(records)), /full-text/);
  });

  it('rejects too few PDF records', () => {
    const records = passingRecords.map((record) =>
      record.sourceFormat === 'pdf' && record.id !== 'pdf-0' ? { ...record, sourceFormat: 'html' } : record
    );
    assert.match(refreshCoverageError(makeIndex(records)), /PDF record/);
  });

  it('rejects a metadata-only ratio above the ceiling', () => {
    const records = [
      ...passingRecords,
      ...Array.from({ length: 14 }, (_, i) => makeRecord({
        id: `meta-${i}`,
        contentQuality: 'metadata_only',
        contentLength: 120,
      })),
    ];
    assert.match(refreshCoverageError(makeIndex(records)), /metadata-only ratio/);
  });
});
