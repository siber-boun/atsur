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
