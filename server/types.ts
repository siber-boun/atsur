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
