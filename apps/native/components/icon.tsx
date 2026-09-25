import Airplane01Icon from "@hugeicons/core-free-icons/dist/esm/Airplane01Icon";
import AlertCircleIcon from "@hugeicons/core-free-icons/dist/esm/AlertCircleIcon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/dist/esm/ArrowDown01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/dist/esm/ArrowLeft01Icon";
import ArrowLeftRightIcon from "@hugeicons/core-free-icons/dist/esm/ArrowLeftRightIcon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/dist/esm/ArrowRight01Icon";
import ArrowUp01Icon from "@hugeicons/core-free-icons/dist/esm/ArrowUp01Icon";
import ArrowUpRight01Icon from "@hugeicons/core-free-icons/dist/esm/ArrowUpRight01Icon";
import Calendar03Icon from "@hugeicons/core-free-icons/dist/esm/Calendar03Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/dist/esm/Cancel01Icon";
import Car01Icon from "@hugeicons/core-free-icons/dist/esm/Car01Icon";
import ChartBarLineIcon from "@hugeicons/core-free-icons/dist/esm/ChartBarLineIcon";
import CloudOffIcon from "@hugeicons/core-free-icons/dist/esm/CloudOffIcon";
import CreditCardIcon from "@hugeicons/core-free-icons/dist/esm/CreditCardIcon";
import File01Icon from "@hugeicons/core-free-icons/dist/esm/File01Icon";
import Film01Icon from "@hugeicons/core-free-icons/dist/esm/Film01Icon";
import FlashIcon from "@hugeicons/core-free-icons/dist/esm/FlashIcon";
import Folder01Icon from "@hugeicons/core-free-icons/dist/esm/Folder01Icon";
import FolderOpenIcon from "@hugeicons/core-free-icons/dist/esm/FolderOpenIcon";
import FuelStationIcon from "@hugeicons/core-free-icons/dist/esm/FuelStationIcon";
import HelpCircleIcon from "@hugeicons/core-free-icons/dist/esm/HelpCircleIcon";
import Home03Icon from "@hugeicons/core-free-icons/dist/esm/Home03Icon";
import Hotel01Icon from "@hugeicons/core-free-icons/dist/esm/Hotel01Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/dist/esm/InformationCircleIcon";
import Invoice01Icon from "@hugeicons/core-free-icons/dist/esm/Invoice01Icon";
import Medicine02Icon from "@hugeicons/core-free-icons/dist/esm/Medicine02Icon";
import Moon02Icon from "@hugeicons/core-free-icons/dist/esm/Moon02Icon";
import MoreHorizontalCircle01Icon from "@hugeicons/core-free-icons/dist/esm/MoreHorizontalCircle01Icon";
import PieChart01Icon from "@hugeicons/core-free-icons/dist/esm/PieChart01Icon";
import Pulse01Icon from "@hugeicons/core-free-icons/dist/esm/Pulse01Icon";
import ReceiptIndianRupeeIcon from "@hugeicons/core-free-icons/dist/esm/ReceiptIndianRupeeIcon";
import ReloadIcon from "@hugeicons/core-free-icons/dist/esm/ReloadIcon";
import RepeatIcon from "@hugeicons/core-free-icons/dist/esm/RepeatIcon";
import Restaurant02Icon from "@hugeicons/core-free-icons/dist/esm/Restaurant02Icon";
import Search01Icon from "@hugeicons/core-free-icons/dist/esm/Search01Icon";
import SchoolIcon from "@hugeicons/core-free-icons/dist/esm/SchoolIcon";
import ShieldCheckIcon from "@hugeicons/core-free-icons/dist/esm/ShieldCheckIcon";
import Shirt01Icon from "@hugeicons/core-free-icons/dist/esm/Shirt01Icon";
import ShoppingBag01Icon from "@hugeicons/core-free-icons/dist/esm/ShoppingBag01Icon";
import ShoppingCart01Icon from "@hugeicons/core-free-icons/dist/esm/ShoppingCart01Icon";
import SparklesIcon from "@hugeicons/core-free-icons/dist/esm/SparklesIcon";
import SquareLock01Icon from "@hugeicons/core-free-icons/dist/esm/SquareLock01Icon";
import Sun03Icon from "@hugeicons/core-free-icons/dist/esm/Sun03Icon";
import TradeDownIcon from "@hugeicons/core-free-icons/dist/esm/TradeDownIcon";
import TradeUpIcon from "@hugeicons/core-free-icons/dist/esm/TradeUpIcon";
import UserCircleIcon from "@hugeicons/core-free-icons/dist/esm/UserCircleIcon";
import Wrench01Icon from "@hugeicons/core-free-icons/dist/esm/Wrench01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react-native";

export const icons = {
  airplane: Airplane01Icon,
  alert: AlertCircleIcon,
  "arrow-up-right": ArrowUpRight01Icon,
  bag: ShoppingBag01Icon,
  car: Car01Icon,
  calendar: Calendar03Icon,
  card: CreditCardIcon,
  cart: ShoppingCart01Icon,
  chart: ChartBarLineIcon,
  "chevron-down": ArrowDown01Icon,
  "chevron-left": ArrowLeft01Icon,
  "chevron-right": ArrowRight01Icon,
  "chevron-up": ArrowUp01Icon,
  close: Cancel01Icon,
  "cloud-off": CloudOffIcon,
  file: File01Icon,
  film: Film01Icon,
  flash: FlashIcon,
  folder: Folder01Icon,
  "folder-open": FolderOpenIcon,
  food: Restaurant02Icon,
  fuel: FuelStationIcon,
  health: Medicine02Icon,
  help: HelpCircleIcon,
  home: Home03Icon,
  hotel: Hotel01Icon,
  info: InformationCircleIcon,
  lock: SquareLock01Icon,
  moon: Moon02Icon,
  more: MoreHorizontalCircle01Icon,
  "pie-chart": PieChart01Icon,
  pulse: Pulse01Icon,
  receipt: Invoice01Icon,
  reload: ReloadIcon,
  repeat: RepeatIcon,
  "rupee-receipt": ReceiptIndianRupeeIcon,
  school: SchoolIcon,
  search: Search01Icon,
  shield: ShieldCheckIcon,
  shirt: Shirt01Icon,
  sparkles: SparklesIcon,
  sun: Sun03Icon,
  swap: ArrowLeftRightIcon,
  "trend-down": TradeDownIcon,
  "trend-up": TradeUpIcon,
  user: UserCircleIcon,
  wrench: Wrench01Icon,
} as const satisfies Record<string, IconSvgElement>;

export type AppIconName = keyof typeof icons;

export function AppIcon({
  name,
  size,
  color,
  strokeWidth = 1.8,
}: {
  name: AppIconName;
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  return <HugeiconsIcon icon={icons[name]} size={size} color={color} strokeWidth={strokeWidth} />;
}
