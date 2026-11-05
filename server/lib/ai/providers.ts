// AI sağlayıcıları. API anahtarları yalnız ortam değişkenlerinden okunur ve
// tarayıcıya hiçbir zaman gönderilmez.

export type ProviderId = 'claude' | 'openai' | 'gemini' | 'openrouter' | 'opencode';

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  kind: 'anthropic' | 'openai-compatible';
  keyEnv: string;
  modelEnv: string;
  /** Yalnız Claude için varsayılan model vardır; diğerlerinde model adı Render'da girilmelidir. */
  defaultModel?: string;
  baseUrlEnv?: string;
  /** OpenAI uyumlu uç noktanın kökü (…/v1). Boşsa baseUrlEnv zorunludur. */
  defaultBaseUrl?: string;
}

export const PROVIDERS: readonly ProviderDefinition[] = [
  { id: 'claude', label: 'Claude', kind: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY', modelEnv: 'AI_CLAUDE_MODEL', defaultModel: 'claude-opus-5-5' },
  { id: 'openai', label: 'ChatGPT', kind: 'openai-compatible', keyEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', baseUrlEnv: 'OPENAI_BASE_URL', defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', label: 'Gemini', kind: 'openai-compatible', keyEnv: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', baseUrlEnv: 'GEMINI_BASE_URL', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'openrouter', label: 'OpenRouter', kind: 'openai-compatible', keyEnv: 'OPENROUTER_API_KEY', modelEnv: 'OPENROUTER_MODEL', baseUrlEnv: 'OPENROUTER_BASE_URL', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'opencode', label: 'OpenCode', kind: 'openai-compatible', keyEnv: 'OPENCODE_API_KEY', modelEnv: 'OPENCODE_MODEL', baseUrlEnv: 'OPENCODE_BASE_URL' }
];

type Env = Record<string, string | undefined>;

export interface ResolvedProvider {
  definition: ProviderDefinition;
  configured: boolean;
  /** Eksik ortam değişkenlerinin adları (değerleri değil). */
  missing: string[];
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const value = (env: Env, name?: string) => (name ? env[name]?.trim() || undefined : undefined);

function validBaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

export function resolveProvider(id: string, env: Env = process.env): ResolvedProvider | null {
  const definition = PROVIDERS.find(item => item.id === id);
  if (!definition) return null;
  const apiKey = value(env, definition.keyEnv);
  const model = value(env, definition.modelEnv) || definition.defaultModel;
  const baseUrl = definition.kind === 'openai-compatible'
    ? validBaseUrl(value(env, definition.baseUrlEnv) || definition.defaultBaseUrl)
    : undefined;
  const missing = [
    !apiKey ? definition.keyEnv : null,
    !model ? definition.modelEnv : null,
    definition.kind === 'openai-compatible' && !baseUrl ? definition.baseUrlEnv || 'BASE_URL' : null
  ].filter((name): name is string => Boolean(name));
  return { definition, configured: missing.length === 0, missing, apiKey, model, baseUrl };
}

export interface PublicProvider {
  id: ProviderId;
  label: string;
  configured: boolean;
  model: string | null;
  missing: string[];
}

/** Tarayıcıya gönderilen sağlayıcı listesi: anahtar ve adres içermez. */
export function listProviders(env: Env = process.env): PublicProvider[] {
  return PROVIDERS.map(definition => {
    const resolved = resolveProvider(definition.id, env) as ResolvedProvider;
    return {
      id: definition.id,
      label: definition.label,
      configured: resolved.configured,
      model: resolved.configured ? resolved.model || null : null,
      missing: resolved.missing
    };
  });
}
