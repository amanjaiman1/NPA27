import {
  History,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  ScrollText,
  SlidersHorizontal,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "./roles";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to roles with this permission. The API refuses the rest anyway. */
  permission: Permission;
  description: string;
}

export const ADMIN_NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Platform",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard, permission: "admin.access", description: "How the platform is doing" },
      { href: "/admin/users", label: "Users", icon: Users, permission: "users.read", description: "Accounts, sign-ins and suspensions" },
      { href: "/admin/reviews", label: "Reviews", icon: Star, permission: "reviews.moderate", description: "Moderate what students wrote" },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, permission: "feedback.manage", description: "Bugs, requests and suggestions" },
    ],
  },
  {
    label: "Publishing",
    items: [
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone, permission: "announcements.manage", description: "Messages inside the app" },
      { href: "/admin/changelog", label: "Changelog", icon: ScrollText, permission: "changelog.manage", description: "Public product updates" },
    ],
  },
  {
    label: "Control",
    items: [
      { href: "/admin/settings", label: "Platform settings", icon: SlidersHorizontal, permission: "settings.manage", description: "Reviews, display and notices" },
      { href: "/admin/access", label: "Admin access", icon: KeyRound, permission: "access.manage", description: "Who runs the platform" },
      { href: "/admin/audit", label: "Audit log", icon: History, permission: "audit.read", description: "Every administrative action" },
    ],
  },
];

export const ADMIN_NAV_ITEMS = ADMIN_NAV.flatMap((g) => g.items);

export function activeAdminItem(pathname: string): AdminNavItem | undefined {
  return [...ADMIN_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}
