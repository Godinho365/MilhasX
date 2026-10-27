import {
  ShoppingCart, CreditCard, Store, CalendarClock, Plane, Hotel, Gift, Coins, Wallet, Repeat, Percent,
  Ticket, Car, BedDouble, Package, HandCoins, Hourglass, MinusCircle,
} from "lucide-react";
import type { EntryType } from "@/domain/ledger";

const ICONS: Record<EntryType, React.ComponentType<{ className?: string }>> = {
  PURCHASE: ShoppingCart,
  CARD: CreditCard,
  PARTNER_PURCHASE: Store,
  CLUB: CalendarClock,
  FLIGHT: Plane,
  HOTEL: Hotel,
  BONUS: Gift,
  OTHER_CREDIT: Coins,
  INITIAL_BALANCE: Wallet,
  TRANSFER_IN: Repeat,
  TRANSFER_BONUS: Percent,
  TRANSFER_OUT: Repeat,
  SALE: HandCoins,
  FLIGHT_REDEMPTION: Ticket,
  CAR_RENTAL: Car,
  HOTEL_REDEMPTION: BedDouble,
  PRODUCT_REDEMPTION: Package,
  EXPIRATION: Hourglass,
  OTHER_DEBIT: MinusCircle,
};

const TONE: Partial<Record<EntryType, string>> = {
  CLUB: "text-violet-400",
  PURCHASE: "text-sky-400",
  BONUS: "text-amber-400",
  TRANSFER_BONUS: "text-amber-400",
  EXPIRATION: "text-red-400",
};

export function EntryIcon({ type, className = "" }: { type: EntryType; className?: string }) {
  const I = ICONS[type];
  return <I className={`h-4 w-4 shrink-0 ${TONE[type] ?? "text-muted"} ${className}`} aria-hidden />;
}
