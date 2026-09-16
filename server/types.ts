export interface SubdomainSourceResult {
  subdomain: string;
  source?: string;
  ip?: string;
}

export interface PortResult {
  port: number;
  status: number | string;
  isCloudflare: boolean;
  protocol: string;
  transport: 'tcp' | 'udp';
  service: string;
  isWeb: boolean;
  /** HTTP doğrulanmasa bile hedef listesinde web/panel hizmeti olarak tanımlanmış açık port. */
  isWebCandidate: boolean;
}

export interface TechSignature {
  name: string;
  category: string;
  headers: Record<string, RegExp>;
  html: RegExp | null;
}

export type DnsStatus = 'live' | 'dead' | 'private' | 'error';

export interface DnsResult {
  host: string;
  status: DnsStatus;
  a: string[];
  cname: string[];
  cnameTarget?: string;
  nxdomainAtEnd?: boolean;
  wildcardMatch?: boolean;
}

export interface WildcardInfo {
  isWildcard: boolean;
  wildcardIps: string[];
  wildcardCname?: string;
  confidence: 'high' | 'low';
}

export interface SubdomainData {
  subdomain: string;
  source: string;
  sources?: string[];
  ip?: string;
  ips?: string[];
  status?: DnsStatus | 'unknown';
  cname?: string[];
  wildcardMatch?: boolean;
  discoveredBy?: 'passive' | 'brute' | 'permutation' | 'axfr' | 'cert-san';
}

export interface ScanResponse {
  domain: string;
  wildcard: WildcardInfo;
  sources: import('./sources/types').SourceStatus[];
  results: SubdomainData[];
  truncatedValidation: boolean;
}

export type { CookieFinding } from './lib/cookies';
export type { CorsFinding } from './lib/cors';
export type { DmarcResult } from './lib/dmarc';
export type { SpfResult } from './lib/spf';
export type { SslInfo } from './lib/tls';

export interface EmailSecurityInfo {
  spf: import('./lib/spf').SpfResult & { hasMinusAll: boolean };
  dmarc: import('./lib/dmarc').DmarcResult;
  dkim: { hasRecord: boolean };
  dnssec: boolean | null;
  mtaSts: { hasRecord: boolean; mode?: 'enforce' | 'testing' | 'none'; policyFetched: boolean };
  tlsRpt: { hasRecord: boolean };
  caa: { hasRecord: boolean; issuers: string[] };
  score: number;
  grade: string;
}
