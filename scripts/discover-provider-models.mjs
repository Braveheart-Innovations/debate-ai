#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = process.cwd();
const REQUEST_TIMEOUT_MS = 30000;

const args = process.argv.slice(2);
const argValue = (name) => {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

// Aliases mobile intentionally resolves to concrete IDs even though the
// provider serves the rolling ID directly: mobile has no unknown-ID
// passthrough, so these must map to catalog entries. Exempt from the
// alias-masking and alias-conflict checks.
const MOBILE_RESOLVING_ALIAS_EXCEPTIONS = new Set([
  'gemini-pro-latest',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
]);

const jsonOutput = args.includes('--json');
const checkMode = args.includes('--check');
const includeAllMissing = args.includes('--include-all');
const selectedProviders = new Set(
  (argValue('--provider') || argValue('--providers') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

// Model IDs providers still serve but the registry intentionally skips
// (superseded generations kept alive server-side). Listed explicitly so the
// report stays quiet without hiding genuinely new IDs.
const KNOWN_SUPERSEDED_IDS = new Set([
  // Z.ai keeps legacy GLM generations alive; glm-5 itself is superseded by
  // glm-5.1/5.2 and glm-5-turbo.
  'glm-4.5',
  'glm-4.5-air',
  'glm-4.6',
  'glm-4.7',
  'glm-5',
  // Mistral re-hosts Z.ai's GLM under these IDs; GLM is served natively via
  // the zai provider (dotted IDs like glm-5.2), so skip the Mistral copies.
  'glm-5-2',
  'zai-glm-5',
  'zai-glm-5-2',
  'zai-glm-5-3',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-pro',
  'gpt-5.1',
  'gpt-5.2-pro',
  'gpt-5.4-pro',
  'gemini-2.0-flash-lite',
  'mistral-medium-2505',
  'command-r-plus-08-2024',
  'command-r7b-arabic-02-2025',
]);

// Model IDs whose provider catalog metadata is known to be wrong. The live
// endpoint is still authoritative for presence, but capability drift for these
// IDs is skipped because direct probes contradict the catalog:
// - mistral-medium-2604: /v1/models returns a stub (completion_chat false, 32K
//   context, every capability false) while chat, tool calls, image input, and
//   120K-token prompts all succeed on 2026-09-03. Re-check each refresh and
//   drop the entry once Mistral fixes the catalog.
const CATALOG_METADATA_UNRELIABLE = new Set([
  'mistral-medium-2604',
]);

const PROVIDERS = [
  {
    id: 'claude',
    name: 'Anthropic',
    env: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    endpoint: 'GET https://api.anthropic.com/v1/models',
    source: 'https://platform.claude.com/docs/en/api/models/list',
    url: () => 'https://api.anthropic.com/v1/models',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      name: model.display_name,
      createdAt: model.created_at,
      contextLength: model.max_input_tokens,
      maxOutputTokens: model.max_tokens,
      capabilities: model.capabilities ? {
        vision: model.capabilities.image_input?.supported,
        documents: model.capabilities.pdf_input?.supported,
        thinking: model.capabilities.thinking?.supported,
      } : undefined,
      raw: model,
    })) || [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    env: ['OPENAI_API_KEY'],
    endpoint: 'GET https://api.openai.com/v1/models',
    source: 'https://platform.openai.com/docs/api-reference/models/list',
    url: () => 'https://api.openai.com/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      createdAt: model.created,
      ownedBy: model.owned_by,
      raw: model,
    })) || [],
    interestingId: (id) => /^(gpt|o\d|chatgpt|dall-e|gpt-image)/.test(id),
    // Dated snapshots (gpt-5.5-2026-04-23) count as covered by their base ID.
    registryCandidates: (id) => {
      const dateless = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
      return dateless !== id ? [id, dateless] : [id];
    },
    note: 'OpenAI /v1/models returns IDs only — capabilities, limits, and pricing must be curated from docs.',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    endpoint: 'GET https://generativelanguage.googleapis.com/v1beta/models',
    source: 'https://ai.google.dev/api/models',
    url: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    headers: () => ({}),
    extract: (payload) => payload.models?.map((model) => ({
      id: String(model.name || '').replace(/^models\//, ''),
      name: model.displayName,
      supportedGenerationMethods: model.supportedGenerationMethods,
      contextLength: model.inputTokenLimit,
      maxOutputTokens: model.outputTokenLimit,
      capabilities: typeof model.thinking === 'boolean' ? { thinking: model.thinking } : undefined,
      samplingDefaults: {
        temperature: model.temperature,
        maxTemperature: model.maxTemperature,
        topP: model.topP,
        topK: model.topK,
      },
      raw: model,
    })) || [],
    interestingId: (id) => /^(gemini|imagen|veo|lyria|gemma)/.test(id),
    // Versioned snapshots (gemini-2.0-flash-001) count as covered by their base ID.
    registryCandidates: (id) => {
      const versionless = id.replace(/-\d{3}$/, '');
      return versionless !== id ? [id, versionless] : [id];
    },
  },
  {
    id: 'perplexity',
    name: 'Perplexity Agent API',
    env: ['PERPLEXITY_API_KEY'],
    endpoint: 'GET https://api.perplexity.ai/v1/models',
    source: 'https://docs.perplexity.ai/api-reference/models-get',
    url: () => 'https://api.perplexity.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      createdAt: model.created,
      ownedBy: model.owned_by,
      raw: model,
    })) || [],
    registryCandidates: (id) => id.startsWith('perplexity/')
      ? [id, id.replace(/^perplexity\//, '')]
      : [id],
    exactRegistrySurface: false,
    note: 'Perplexity /v1/models lists Agent API IDs. Sonar chat-completions IDs still need live smoke validation.',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    env: ['MISTRAL_API_KEY'],
    endpoint: 'GET https://api.mistral.ai/v1/models',
    source: 'https://docs.mistral.ai/api/endpoint/models',
    url: () => 'https://api.mistral.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      name: model.name,
      createdAt: model.created,
      contextLength: model.max_context_length,
      aliases: model.aliases,
      isDeprecated: Boolean(model.deprecation),
      capabilities: model.capabilities ? {
        vision: model.capabilities.vision,
        functions: model.capabilities.function_calling,
        thinking: model.capabilities.reasoning,
      } : undefined,
      raw: model,
    })) || [],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    env: ['COHERE_API_KEY'],
    endpoint: 'GET https://api.cohere.ai/v1/models',
    source: 'https://docs.cohere.com/reference/list-models',
    url: () => 'https://api.cohere.ai/v1/models?page_size=1000',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.models?.map((model) => ({
      id: model.name,
      isDeprecated: model.is_deprecated,
      endpoints: model.endpoints,
      features: model.features,
      contextLength: model.context_length,
      capabilities: Array.isArray(model.features) ? {
        vision: model.features.includes('vision'),
        functions: model.features.includes('tools'),
        thinking: model.features.includes('reasoning'),
      } : undefined,
      raw: model,
    })) || [],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    env: ['DEEPSEEK_API_KEY'],
    endpoint: 'GET https://api.deepseek.com/models',
    source: 'https://api-docs.deepseek.com/api/list-models',
    url: () => 'https://api.deepseek.com/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      ownedBy: model.owned_by,
      raw: model,
    })) || [],
  },
  {
    id: 'grok',
    name: 'xAI',
    env: ['GROK_API_KEY', 'XAI_API_KEY'],
    endpoint: 'GET https://api.x.ai/v1/models',
    source: 'https://docs.x.ai/developers/rest-api-reference/inference/models',
    url: () => 'https://api.x.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      createdAt: model.created,
      ownedBy: model.owned_by,
      contextLength: model.context_length,
      aliases: model.aliases,
      // xAI price fields are in 1/10000 USD per million tokens.
      pricing: model.prompt_text_token_price != null ? {
        input: model.prompt_text_token_price / 10000,
        output: model.completion_text_token_price / 10000,
      } : undefined,
      raw: model,
    })) || [],
    // /v1/language-models adds input/output modalities (vision detection).
    enrich: async (key, models) => {
      const response = await fetch('https://api.x.ai/v1/language-models', {
        headers: { Authorization: `Bearer ${key.value}` },
      });
      if (!response.ok) {
        throw new Error(`language-models HTTP ${response.status}`);
      }
      const payload = await response.json();
      const byId = new Map((payload.models || []).map((model) => [model.id, model]));
      return models.map((model) => {
        const languageModel = byId.get(model.id);
        if (!languageModel) return model;
        return {
          ...model,
          capabilities: {
            ...model.capabilities,
            vision: Array.isArray(languageModel.input_modalities)
              ? languageModel.input_modalities.includes('image')
              : undefined,
          },
          raw: { ...model.raw, language_model: languageModel },
        };
      });
    },
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    env: ['MOONSHOT_API_KEY'],
    endpoint: 'GET https://api.moonshot.ai/v1/models',
    source: 'https://platform.kimi.ai/docs/models',
    url: () => 'https://api.moonshot.ai/v1/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      ownedBy: model.owned_by,
      contextLength: model.context_length,
      capabilities: typeof model.supports_image_in === 'boolean' || typeof model.supports_reasoning === 'boolean'
        ? {
          vision: model.supports_image_in,
          thinking: model.supports_reasoning,
        }
        : undefined,
      raw: model,
    })) || [],
    note: 'Returns context_length + supports_image_in/supports_reasoning (since 2026-09); pricing is docs-curated. moonshot-v1-* series sunsets 2026-08-31 — never catalog it.',
  },
  {
    id: 'zai',
    name: 'Z.ai',
    env: ['ZAI_API_KEY'],
    endpoint: 'GET https://api.z.ai/api/paas/v4/models',
    source: 'https://docs.z.ai/guides/overview/quick-start',
    url: () => 'https://api.z.ai/api/paas/v4/models',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extract: (payload) => payload.data?.map((model) => ({
      id: model.id,
      ownedBy: model.owned_by,
      raw: model,
    })) || [],
    note: 'Bare IDs only (verified 2026-08-17); capabilities/pricing are docs-curated. Catalog can list gated models — probe chat completions before curating new IDs (glm-5.3 returned permission error 1220 on standard keys until September 2026).',
  },
];

function trimQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath, loadedFiles) {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(ROOT, filePath);

  if (loadedFiles.has(resolvedPath) || !fs.existsSync(resolvedPath)) {
    return false;
  }
  loadedFiles.add(resolvedPath);

  for (const line of fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = trimQuotes(match[2]);
    }
  }
  return true;
}

function loadEnv() {
  const loadedFiles = new Set();
  loadEnvFile('.env.local', loadedFiles);
  loadEnvFile('.env', loadedFiles);

  let loadedExtra = true;
  while (loadedExtra) {
    loadedExtra = false;
    for (const filePath of (process.env.LIVE_PROXY_ENV_FILES || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)) {
      loadedExtra = loadEnvFile(filePath, loadedFiles) || loadedExtra;
    }
  }

  return Array.from(loadedFiles);
}

function propertyName(node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function literalValue(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(literalValue);
  }
  if (ts.isSpreadElement(node)) {
    return literalValue(node.expression);
  }
  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    return literalValue(node.arguments[0]);
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const name = propertyName(prop.name);
        if (name) {
          result[name] = literalValue(prop.initializer);
        }
      }
    }
    return result;
  }
  return undefined;
}

function findVariableInitializer(sourceFile, variableName) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && propertyName(node.name) === variableName) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return initializer;
}

function readRegistry() {
  const modelConfigsPath = path.join(ROOT, 'src/config/modelConfigs.ts');
  const modelRegistryPath = path.join(ROOT, 'src/config/providers/modelRegistry.ts');
  const imageModelsPath = path.join(ROOT, 'src/config/imageGenerationModels.ts');
  const modelConfigs = ts.createSourceFile(
    modelConfigsPath,
    fs.readFileSync(modelConfigsPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const modelRegistry = ts.createSourceFile(
    modelRegistryPath,
    fs.readFileSync(modelRegistryPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const imageModels = ts.createSourceFile(
    imageModelsPath,
    fs.readFileSync(imageModelsPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );

  return {
    modelsByProvider: literalValue(findVariableInitializer(modelConfigs, 'AI_MODELS')) || {},
    imageModelsByProvider: literalValue(findVariableInitializer(imageModels, 'IMAGE_MODELS')) || {},
    curatedByProvider: literalValue(findVariableInitializer(modelConfigs, 'CURATED_MODEL_IDS')) || {},
    aliases: literalValue(findVariableInitializer(modelRegistry, 'MODEL_ALIASES')) || {},
    imageAliases: literalValue(findVariableInitializer(imageModels, 'IMAGE_MODEL_ALIASES')) || {},
    defaults: literalValue(findVariableInitializer(modelRegistry, 'DEFAULT_PROVIDER_MODELS')) || {},
  };
}

function keyForProvider(provider) {
  for (const envName of provider.env) {
    const value = process.env[envName]?.trim();
    if (value) {
      return { envName, value };
    }
  }
  return null;
}

async function fetchJson(provider, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(provider.url(key.value), {
      headers: provider.headers(key.value),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        error: `HTTP ${response.status}: ${text.slice(0, 240)}`,
      };
    }
    return { payload: JSON.parse(text) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function registryCandidates(provider, discoveredId) {
  return provider.registryCandidates
    ? provider.registryCandidates(discoveredId)
    : [discoveredId];
}

function registryAndImageCandidates(provider, discoveredId, registry) {
  const candidates = registryCandidates(provider, discoveredId);
  const imageAliasTarget = registry.imageAliases[provider.id]?.[discoveredId];
  if (imageAliasTarget) {
    candidates.push(imageAliasTarget);
  }
  return Array.from(new Set(candidates));
}

function isImageModelId(id) {
  return /^(gpt-image|chatgpt-image|dall-e|gemini-.*image|imagen-|grok-imagine-image)/.test(id);
}

function isUnsupportedMediaModelId(id) {
  // Audio, video, speech, and realtime models the app has no surface for.
  return /^(veo-|lyria-|sora|whisper|tts-|gpt-audio|gpt-realtime|gpt-live|gemini-omni-|gemini-.*-live-|voxtral|omni-moderation|.*-tts(?:-|$)|.*transcribe|.*native-audio|grok-imagine-video|cohere-transcribe)/.test(id);
}

function isCatalogOnlyModelId(id) {
  // Embeddings, rerankers, retired generations, agent-product variants, and
  // provider-side "-latest" alias IDs (aliases are resolved app-side).
  return /-latest$/.test(id)
    || KNOWN_SUPERSEDED_IDS.has(id)
    || /^(gemma-|embed-|rerank-|nvidia\/|davinci|babbage|text-embedding|gpt-3\.5|gpt-4$|gpt-4-|o1-pro|o3-pro|open-mistral|mistral-tiny|mistral-code|mistral-embed|mistral-moderation|mistral-ocr|codestral-embed|labs-|c4ai-|tiny-aya|north-mini|parse-|.*embedding|.*robotics|.*-computer-use|.*customtools|.*deep-research|.*search-preview|.*search-api|.*-codex(?:-|$)|.*vibe-cli|grok-4\.20-multi-agent)/.test(id);
}

const CAPABILITY_FLAG_PAIRS = [
  ['vision', 'supportsVision'],
  ['documents', 'supportsDocuments'],
  ['functions', 'supportsFunctions'],
  ['thinking', 'supportsThinking'],
];

function collectCapabilityDrift(configuredModels, discoveredById) {
  const drift = [];
  for (const model of configuredModels) {
    if (model.isDeprecated || model.supportsImageGeneration) continue;
    if (CATALOG_METADATA_UNRELIABLE.has(model.id)) continue;
    const discovered = discoveredById.get(model.id);
    if (!discovered) continue;

    const issues = [];
    if (discovered.contextLength && model.contextLength
      && discovered.contextLength !== model.contextLength) {
      issues.push(`contextLength ${model.contextLength} -> ${discovered.contextLength}`);
    }
    if (discovered.maxOutputTokens
      && discovered.maxOutputTokens !== (model.maxOutputTokens ?? null)) {
      issues.push(`maxOutputTokens ${model.maxOutputTokens ?? 'unset'} -> ${discovered.maxOutputTokens}`);
    }
    for (const [capKey, configKey] of CAPABILITY_FLAG_PAIRS) {
      const discoveredFlag = discovered.capabilities?.[capKey];
      if (typeof discoveredFlag === 'boolean' && Boolean(model[configKey]) !== discoveredFlag) {
        issues.push(`${configKey} ${Boolean(model[configKey])} -> ${discoveredFlag}`);
      }
    }
    if (issues.length) {
      drift.push({ id: model.id, issues });
    }
  }
  return drift;
}

// Some providers (Mistral) list every alias of a model as its own catalog
// entry and cross-reference the whole group both ways. Union the groups so a
// group counts as covered if ANY member is configured, and only one canonical
// member (preferring dated snapshot IDs) surfaces as "missing".
function buildAliasGroups(discoveredModels) {
  const groups = new Map();
  for (const model of discoveredModels) {
    if (!model.id) continue;
    const members = [model.id, ...(model.aliases || [])];
    const merged = new Set();
    for (const member of members) {
      for (const value of groups.get(member) || []) {
        merged.add(value);
      }
      merged.add(member);
    }
    for (const member of merged) {
      groups.set(member, merged);
    }
  }
  return groups;
}

function groupRepresentative(id, aliasGroups, discoveredIdSet) {
  const group = Array.from(aliasGroups.get(id) || [id])
    .filter((member) => discoveredIdSet.has(member));
  if (group.length <= 1) return id;
  const dated = group.filter((member) => /-\d{3,4}$/.test(member) && !/-latest$/.test(member));
  const nonCatalog = group.filter((member) => !isCatalogOnlyModelId(member));
  const pool = dated.length ? dated : (nonCatalog.length ? nonCatalog : group);
  return pool.sort()[0];
}

function collectAliasConflicts(discoveredModels, registry, aliasGroups) {
  const conflicts = [];
  const seen = new Set();
  for (const model of discoveredModels) {
    for (const alias of model.aliases || []) {
      const ourTarget = registry.aliases[alias];
      if (!ourTarget || seen.has(alias)) continue;
      if (MOBILE_RESOLVING_ALIAS_EXCEPTIONS.has(alias)) continue;
      const group = aliasGroups.get(alias);
      if (ourTarget !== model.id && !(group && group.has(ourTarget))) {
        seen.add(alias);
        conflicts.push({ alias, providerTarget: model.id, ourTarget });
      }
    }
  }
  return conflicts;
}

function compareProvider(provider, discoveredModels, registry) {
  const discoveredIds = Array.from(new Set(discoveredModels.map((model) => model.id).filter(Boolean)));
  const discoveredIdSet = new Set(discoveredIds);
  const discoveredById = new Map(discoveredModels.map((model) => [model.id, model]));
  const aliasGroups = buildAliasGroups(discoveredModels);
  const configuredModels = registry.modelsByProvider[provider.id] || [];
  const configuredImageModels = registry.imageModelsByProvider[provider.id] || [];
  const configuredById = new Map(configuredModels.map((model) => [model.id, model]));
  const configuredIdSet = new Set(configuredModels.map((model) => model.id));
  const configuredImageIdSet = new Set(configuredImageModels.map((model) => model.id));
  const configuredSurfaceIdSet = new Set([
    ...configuredIdSet,
    ...configuredImageIdSet,
  ]);
  const curatedIds = registry.curatedByProvider[provider.id] || [];
  const defaultId = registry.defaults[provider.id];
  const interestingId = provider.interestingId || (() => true);
  const exactRegistrySurface = provider.exactRegistrySurface !== false;

  const coverageCandidates = (id) => {
    const candidates = new Set(registryAndImageCandidates(provider, id, registry));
    for (const member of aliasGroups.get(id) || []) {
      candidates.add(member);
    }
    return Array.from(candidates);
  };

  const discoveredMissing = discoveredIds
    .filter((id) => interestingId(id))
    .filter((id) => !coverageCandidates(id).some((candidate) => configuredSurfaceIdSet.has(candidate)));

  // Classify by every registry candidate so dated/versioned snapshots inherit
  // the classification of their base ID; non-canonical members of a discovered
  // alias group are provider-side duplicates, not new models.
  const isCatalogOnly = (id) => groupRepresentative(id, aliasGroups, discoveredIdSet) !== id
    || registryCandidates(provider, id).some((candidate) => isCatalogOnlyModelId(candidate));
  const isUnsupportedMedia = (id) =>
    registryCandidates(provider, id).some((candidate) => isUnsupportedMediaModelId(candidate));

  const discoveredMissingTextRegistry = discoveredMissing
    .filter(() => exactRegistrySurface)
    .filter((id) => !isImageModelId(id))
    .filter((id) => !isUnsupportedMedia(id))
    .filter((id) => !isCatalogOnly(id));

  const discoveredMissingImageRegistry = discoveredMissing
    .filter(() => exactRegistrySurface)
    .filter((id) => isImageModelId(id));

  const discoveredUnsupportedMedia = discoveredMissing
    .filter(() => exactRegistrySurface)
    .filter((id) => isUnsupportedMedia(id));

  const discoveredCatalogOnly = discoveredMissing
    .filter((id) => !exactRegistrySurface || (!isUnsupportedMedia(id) && !isImageModelId(id) && isCatalogOnly(id)));

  const registryNotDiscovered = configuredModels
    .filter((model) => !model.supportsImageGeneration)
    .filter((model) => !model.isDeprecated)
    .filter((model) => exactRegistrySurface && !discoveredIdSet.has(model.id))
    .map((model) => model.id);

  const curatedNotDiscovered = curatedIds
    .filter((id) => exactRegistrySurface && !discoveredIdSet.has(id));

  const defaultNotDiscovered = defaultId && exactRegistrySurface && !discoveredIdSet.has(defaultId)
    ? defaultId
    : undefined;

  const availableButDeprecated = discoveredIds
    .filter((id) => configuredById.get(id)?.isDeprecated);

  const aliasMasksDiscovered = Object.entries(registry.aliases)
    .filter(([from, to]) => discoveredIdSet.has(from) && from !== to)
    .filter(([from]) => !configuredById.get(from)?.isDeprecated)
    .filter(([from]) => !MOBILE_RESOLVING_ALIAS_EXCEPTIONS.has(from))
    // Not masking: the provider's own alias metadata groups from and to
    // together, so our alias resolves exactly as the provider would.
    .filter(([from, to]) => !aliasGroups.get(from)?.has(to))
    // Not masking: a dated/versioned snapshot aliased to its own base ID
    // (registryCandidates already treats the snapshot as covered by the base).
    .filter(([from, to]) => !registryCandidates(provider, from).includes(to))
    // Not masking: superseded IDs the registry intentionally skips; the alias
    // is the documented migration path for persisted sessions.
    .filter(([from]) => !KNOWN_SUPERSEDED_IDS.has(from))
    .map(([from, to]) => ({ from, to }));

  const capabilityDrift = collectCapabilityDrift(configuredModels, discoveredById);
  const aliasConflicts = collectAliasConflicts(discoveredModels, registry, aliasGroups);

  return {
    capabilityDrift,
    aliasConflicts,
    discoveredCount: discoveredIds.length,
    discoveredIds,
    configuredIds: Array.from(configuredIdSet),
    configuredImageIds: Array.from(configuredImageIdSet),
    curatedIds,
    defaultId,
    discoveredMissingInRegistry: discoveredMissingTextRegistry,
    discoveredMissingTextRegistry,
    discoveredMissingImageRegistry,
    discoveredUnsupportedMedia,
    discoveredCatalogOnly,
    registryNotDiscovered,
    curatedNotDiscovered,
    defaultNotDiscovered,
    availableButDeprecated,
    aliasMasksDiscovered,
    exactRegistrySurface,
  };
}

function displayList(values, max = 12) {
  if (!values.length) return 'none';
  const shown = values.slice(0, max);
  const suffix = values.length > shown.length ? `, ... +${values.length - shown.length}` : '';
  return `${shown.join(', ')}${suffix}`;
}

function describeDiscoveredModel(model) {
  if (!model) return '';
  const bits = [];
  if (model.contextLength) bits.push(`ctx ${model.contextLength}`);
  if (model.maxOutputTokens) bits.push(`out ${model.maxOutputTokens}`);
  const flags = Object.entries(model.capabilities || {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (flags.length) bits.push(flags.join('/'));
  if (model.pricing) bits.push(`$${model.pricing.input}/$${model.pricing.output} per M`);
  return bits.length ? ` (${bits.join(', ')})` : '';
}

function displayMissingModels(ids, discoveredModels, max = 20) {
  if (!ids.length) return 'none';
  const byId = new Map((discoveredModels || []).map((model) => [model.id, model]));
  const values = ids.map((id) => `${id}${describeDiscoveredModel(byId.get(id))}`);
  return displayList(values, max);
}

function reportToText(results) {
  const lines = [];
  lines.push('Provider Model Discovery');
  lines.push('');
  for (const result of results) {
    lines.push(`${result.provider.name} (${result.provider.id})`);
    lines.push(`  endpoint: ${result.provider.endpoint}`);
    lines.push(`  source: ${result.provider.source}`);
    if (result.provider.note) {
      lines.push(`  note: ${result.provider.note}`);
    }
    if (result.skipped) {
      lines.push(`  skipped: missing ${result.provider.env.join(' or ')}`);
      lines.push('');
      continue;
    }
    if (result.error) {
      lines.push(`  error: ${result.error}`);
      lines.push('');
      continue;
    }

    const comparison = result.comparison;
    lines.push(`  key: ${result.keyEnv}`);
    if (result.enrichError) {
      lines.push(`  enrich failed (capability metadata incomplete): ${result.enrichError}`);
    }
    lines.push(`  discovered: ${comparison.discoveredCount}`);
    lines.push(`  default: ${comparison.defaultId || 'none'}${comparison.defaultNotDiscovered ? ' (NOT DISCOVERED)' : ''}`);
    lines.push(`  curated not discovered: ${displayList(comparison.curatedNotDiscovered)}`);
    lines.push(`  configured available but deprecated/hidden: ${displayList(comparison.availableButDeprecated)}`);
    lines.push(`  aliases masking exact discovered IDs: ${displayList(comparison.aliasMasksDiscovered.map((item) => `${item.from}->${item.to}`))}`);
    lines.push(`  configured not discovered: ${displayList(comparison.registryNotDiscovered)}`);
    const missing = includeAllMissing
      ? comparison.discoveredMissingInRegistry
      : comparison.discoveredMissingInRegistry.slice(0, 20);
    lines.push(`  discovered text missing in registry: ${displayMissingModels(missing, result.discoveredModels, 20)}`);
    lines.push(`  discovered image missing in image registry: ${displayMissingModels(comparison.discoveredMissingImageRegistry, result.discoveredModels, 20)}`);
    lines.push(`  unsupported media/catalog discovered: ${displayList([
      ...comparison.discoveredUnsupportedMedia,
      ...comparison.discoveredCatalogOnly,
    ], 20)}`);
    lines.push(`  capability drift vs registry: ${comparison.capabilityDrift.length ? '' : 'none'}`);
    for (const drift of comparison.capabilityDrift) {
      lines.push(`    ${drift.id}: ${drift.issues.join('; ')}`);
    }
    lines.push(`  provider alias conflicts: ${displayList(comparison.aliasConflicts.map((item) => `${item.alias} (provider: ${item.providerTarget}, ours: ${item.ourTarget})`))}`);
    lines.push('');
  }
  return lines.join('\n');
}

function checkFailures(results) {
  const failures = [];
  for (const result of results) {
    if (result.skipped || result.error) {
      failures.push(`${result.provider.id}: ${result.skipped || result.error}`);
      continue;
    }
    const comparison = result.comparison;
    if (comparison.defaultNotDiscovered) {
      failures.push(`${result.provider.id}: default ${comparison.defaultNotDiscovered} was not returned by ${result.provider.endpoint}`);
    }
    for (const id of comparison.curatedNotDiscovered) {
      failures.push(`${result.provider.id}: curated model ${id} was not returned by ${result.provider.endpoint}`);
    }
    for (const item of comparison.aliasMasksDiscovered) {
      failures.push(`${result.provider.id}: alias ${item.from} rewrites an exact provider API ID to ${item.to}`);
    }
    for (const drift of comparison.capabilityDrift) {
      failures.push(`${result.provider.id}: ${drift.id} capability drift — ${drift.issues.join('; ')}`);
    }
    for (const item of comparison.aliasConflicts) {
      failures.push(`${result.provider.id}: alias ${item.alias} points to ${item.ourTarget} but the provider resolves it to ${item.providerTarget}`);
    }
  }
  return failures;
}

async function main() {
  const loadedEnvFiles = loadEnv();
  const registry = readRegistry();
  const providers = PROVIDERS.filter((provider) => (
    selectedProviders.size === 0 || selectedProviders.has(provider.id)
  ));

  const results = [];
  for (const provider of providers) {
    const key = keyForProvider(provider);
    if (!key) {
      results.push({
        provider,
        skipped: `missing ${provider.env.join(' or ')}`,
      });
      continue;
    }

    const response = await fetchJson(provider, key);
    if (response.error) {
      results.push({
        provider,
        keyEnv: key.envName,
        error: response.error,
      });
      continue;
    }

    let discoveredModels = provider.extract(response.payload);
    let enrichError;
    if (provider.enrich) {
      try {
        discoveredModels = await provider.enrich(key, discoveredModels);
      } catch (error) {
        enrichError = error instanceof Error ? error.message : String(error);
      }
    }
    results.push({
      provider,
      keyEnv: key.envName,
      enrichError,
      discoveredModels,
      comparison: compareProvider(provider, discoveredModels, registry),
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    loadedEnvFiles,
    results: results.map((result) => ({
      provider: result.provider.id,
      providerName: result.provider.name,
      endpoint: result.provider.endpoint,
      source: result.provider.source,
      note: result.provider.note,
      keyEnv: result.keyEnv,
      skipped: result.skipped,
      error: result.error,
      enrichError: result.enrichError,
      discoveredModels: result.discoveredModels,
      comparison: result.comparison,
    })),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(reportToText(results));
  }

  if (checkMode) {
    const failures = checkFailures(results);
    if (failures.length > 0) {
      console.error('Discovery check failed:');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
