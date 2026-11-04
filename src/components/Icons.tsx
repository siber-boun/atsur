import type { ReactNode } from 'react';

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const DashboardIcon = () => <Icon><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></Icon>;
export const AssetsIcon = () => <Icon><rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" /><path d="M7 7h.01M7 17h.01" /></Icon>;
export const FindingsIcon = () => <Icon><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Icon>;
export const TechIcon = () => <Icon><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></Icon>;
export const ScopeIcon = () => <Icon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon>;
export const AiIcon = () => <Icon><path d="M12 3l1.8 4.6 4.7 1.9-4.7 1.9L12 16l-1.8-4.6-4.7-1.9 4.7-1.9z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></Icon>;
export const TargetsIcon = () => <Icon><path d="M4 6h16M4 12h16M4 18h10" /></Icon>;
export const SearchIcon = ({ size = 16 }: { size?: number }) => <Icon size={size}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Icon>;
export const GlobeIcon = () => <Icon size={16}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>;
export const RefreshIcon = () => <Icon size={16}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></Icon>;
export const CloseIcon = () => <Icon size={14}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const TrashIcon = () => <Icon size={15}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
export const LogoutIcon = () => <Icon size={16}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></Icon>;
export const ExternalIcon = () => <Icon size={13}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>;
export const CheckIcon = () => <Icon size={12}><path d="M5 12l5 5 9-10" /></Icon>;
