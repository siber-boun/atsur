import { createContext, useContext } from 'react';
import type { AdvancedRun, AiReport, ServiceRun } from '../types';
import type { Route } from './route';
import type { Workspace } from './workspace';

export type DomainState = 'done' | 'scanning' | 'pending';

export interface ConsoleValue {
  user: string | null;
  domains: string[];
  domain: string | null;
  domainState: (domain: string) => DomainState;
  domainAssetCount: (domain: string) => number;
  domainScopeCount: (domain: string) => number | null;
  ws: Workspace | null;
  route: Route;
  navigate: (route: Route) => void;
  loading: boolean;
  wakingUp: boolean;
  error?: string;
  runs: {
    service?: ServiceRun;
    advanced?: AdvancedRun;
    serviceRunning: boolean;
    advancedRunning: boolean;
    autoStage?: 'waiting-services' | 'services' | 'waiting-advanced' | 'done';
    autoCountdown: number;
    autoScheduled: boolean;
  };
  scope: {
    hosts: string[];
    text: string;
    saved: boolean;
    canGenerate: boolean;
    generate: () => void;
  };
  actions: {
    selectDomain: (domain: string) => void;
    addDomain: (domain: string) => boolean;
    deleteDomain: (domain: string) => void;
    refresh: () => void;
    analyzeAll: () => void;
    advancedAnalysis: () => void;
    analyzeHost: (host: string) => void;
    logout: () => void;
  };
  ai: {
    report?: AiReport;
    /** Raporu başladığı hedefe yazar; hedef değişse bile doğru kayda gider. */
    saveReport: (domain: string, report: AiReport | null) => void;
  };
  authBusy: boolean;
}

export const ConsoleContext = createContext<ConsoleValue | null>(null);

export function useConsole(): ConsoleValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsole, ConsoleContext içinde kullanılmalı');
  return value;
}

export const DOMAIN_PATTERN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
