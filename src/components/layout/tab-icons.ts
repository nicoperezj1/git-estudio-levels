import {
  Building2, CalendarCheck, CalendarDays, ClipboardList, DollarSign, Home, KeyRound, LifeBuoy, MessageCircle, Package,
  Percent, PiggyBank, Receipt, Scissors, ShieldCheck, ShoppingCart, Tag, Ticket, UserCircle, Users, Wallet, Zap,
} from "lucide-react";

// Nombre -> icono para los atajos de la barra inferior (ver lib/mobile-tabs.ts).
export const TAB_ICONS: Record<string, any> = {
  home: Home, "calendar-check": CalendarCheck, calendar: CalendarDays, zap: Zap, cart: ShoppingCart, wallet: Wallet,
  users: Users, message: MessageCircle, ticket: Ticket, dollar: DollarSign, receipt: Receipt, clipboard: ClipboardList,
  piggy: PiggyBank, percent: Percent, key: KeyRound, scissors: Scissors, tag: Tag, package: Package,
  lifebuoy: LifeBuoy, user: UserCircle, building: Building2, shield: ShieldCheck,
};
