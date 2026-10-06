declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react';

  type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

  export const ArrowRight: IconComponent;
  export const CalendarDays: IconComponent;
  export const ChevronDown: IconComponent;
  export const Clock: IconComponent;
  export const Gift: IconComponent;
  export const HandHeart: IconComponent;
  export const Mail: IconComponent;
  export const Menu: IconComponent;
  export const MessageCircle: IconComponent;
  export const Phone: IconComponent;
  export const RefreshCw: IconComponent;
  export const ShieldCheck: IconComponent;
  export const Sparkles: IconComponent;
  export const TicketCheck: IconComponent;
  export const Trophy: IconComponent;
  export const UsersRound: IconComponent;
  export const Wallet: IconComponent;
  export const X: IconComponent;
}
