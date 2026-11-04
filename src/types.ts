// Backend yanıtlarının frontend tarafındaki şekilleri. Sunucudaki karşılıkları:
// server/types.ts, server/lib/tls.ts (SslInfo), server/lib/evidence.ts (SecurityFinding).

export type Step = 'login' | 'dashboard';

export interface SubdomainData {
  subdomain: string;
  source: string;
  sources?: string[];
  ip?: string;
  ips?: string[];
  status?: 'live' | 'dead' | 'private' | 'error' | 'unknown';
  cname?: string[];
  wildcardMatch?: boolean;
  discoveredBy?: 'passive' | 'brute' | 'permutation' | 'axfr' | 'cert-san';
}

/** Eski localStorage kayıtlarında subdomain düz string olarak tutulabiliyor. */
export type StoredSubdomain = SubdomainData | string;

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  ms: number;
  skipped?: 'no-key' | 'timeout' | 'error' | 'disabled' | 'rate-limited';
}

export interface WildcardInfo {
  isWildcard: boolean;
  confidence: 'high' | 'low';
  wildcardIps: string[];
}

export interface ScanMeta {
  sources: SourceStatus[];
  wildcard: WildcardInfo;
  truncatedValidation: boolean;
  bruteSkipped?: string;
  bruteCount?: number;
}

export interface ScanResponse {
  results?: SubdomainData[];
  sources?: SourceStatus[];
  wildcard?: WildcardInfo;
  truncatedValidation?: boolean;
}

export interface BruteResponse {
  results?: SubdomainData[];
  skipped?: string;
}

export interface AdvancedRun {
  running: boolean;
  stage: string;
  completed: number;
  total: number;
  failed?: number;
  error?: string;
}

export interface ServiceRun {
  running: boolean;
  stage: string;
  completed: number;
  total: number;
  failed: number;
  error?: string;
}

export interface PortInfo {
  port: number;
  status: number | string;
  protocol: string;
  transport?: 'tcp' | 'udp';
  service?: string;
  isWeb?: boolean;
  isWebCandidate?: boolean;
  verificationSource?: 'server' | 'render' | 'browserless' | 'browser';
  redirected?: boolean;
  finalHost?: string;
}

export interface ProbeError {
  port: number;
  protocol: 'http:' | 'https:';
  code: string;
}

export interface TechInfo {
  name: string;
  category: string;
  version?: string;
  confidence?: number;
  sources?: Array<'opentechalyzer' | 'builtin' | 'browserless-live' | 'shodan'>;
  evidence?: string[];
  observedAt?: string;
  passive?: boolean;
}

export interface SslInfo {
  valid: boolean;
  daysLeft?: number;
  issuer?: string;
  isSelfSigned?: boolean;
  grade: string;
  protocol?: string;
  cipher?: { name: string; version: string; weak: boolean };
  legacyProtocols?: { tls10: 'yes' | 'no' | 'unknown'; tls11: 'yes' | 'no' | 'unknown' };
  chainComplete?: boolean;
  san?: string[];
  hostnameMatch?: boolean;
}

export interface SecurityInfo {
  score: number;
  grade: string;
  missing: string[];
}

export interface WafInfo {
  detected: boolean;
  name?: string;
}

export interface CookieInfo {
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | null;
  issues: string[];
}

export interface EvidenceInfo {
  source: 'render-live' | 'browserless-live';
  status?: number;
  protocol?: 'http:' | 'https:';
  server?: string;
  redirectCount?: number;
  redirected?: boolean;
  finalTarget?: string;
  externalRedirect?: { target: string; status?: number };
}

export interface TlsVerification {
  verified: boolean;
  source: 'render-live' | 'browserless-live';
}

export interface SubdomainDetail {
  ip?: string | null;
  ports?: PortInfo[];
  isCloudflare?: boolean;
  analyzing?: boolean;
  technologies?: TechInfo[];
  techAnalyzing?: boolean;
  ssl?: SslInfo | null;
  security?: SecurityInfo;
  waf?: WafInfo;
  cookies?: CookieInfo[];
  probeErrors?: ProbeError[];
  serviceError?: string;
  evidence?: EvidenceInfo;
  tlsVerification?: TlsVerification;
  browserlessError?: string;
  advancedAnalyzing?: boolean;
  advancedError?: string;
}

export interface AnalyzeResponse {
  ip?: string | null;
  ports?: PortInfo[];
  isCloudflare?: boolean;
  probeErrors?: ProbeError[];
}

export interface AdvancedResponse {
  ssl?: SslInfo | null;
  advanced?: { security?: SecurityInfo; waf?: WafInfo; cookies?: CookieInfo[] } | null;
  technologies?: TechInfo[];
  evidence?: EvidenceInfo;
  tlsVerification?: TlsVerification;
  browserlessError?: string;
  blocked?: boolean;
}

export interface EmailSecurityInfo {
  spf: { hasRecord: boolean; hasMinusAll: boolean; all?: string | null; lookupCount?: number; permerror?: boolean; permerrorReason?: string; truncated?: boolean };
  dmarc: { hasRecord: boolean; policy: string; percentage?: number; aggregateReports?: boolean; forensicReports?: boolean; adkim?: string; aspf?: string };
  dkim: { hasRecord: boolean };
  dnssec?: boolean | null;
  mtaSts?: { hasRecord: boolean; mode?: string; policyFetched: boolean };
  tlsRpt?: { hasRecord: boolean };
  caa?: { hasRecord: boolean; issuers: string[] };
  score: number;
  grade: string;
}

export interface AuthSession {
  email: string;
  expiresAt: number;
  csrfToken: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiReport {
  provider: string;
  model: string;
  createdAt: string;
  messages: AiChatMessage[];
}

/** localStorage `osint_users[email]` kaydı. */
export interface UserData {
  domains: string[];
  subdomainsCache: Record<string, StoredSubdomain[]>;
  subdomainDetailsCache: Record<string, SubdomainDetail>;
  emailSecCache: Record<string, EmailSecurityInfo>;
  scopes?: Record<string, string>;
  aiReports?: Record<string, AiReport>;
}
