"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { NotificationBellIcon } from "mage-icons-react/bulk";
import { toast } from "sonner";
import { DateTime } from "luxon";
import fetcher from "@/lib/fetcher";
import { patch } from "@/lib/apis";
import useAuthStore from "@/store/auth.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function NotificationsBell() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const seenIds = useRef(new Set());
  const primed = useRef(false);


  const { data, mutate } = useSWR(
    isAuthenticated ? "/api/notifications?limit=30" : null,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
      dedupingInterval: 10000,
    },
  );

  const items = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  useEffect(() => {
    if (!items.length) return;
    if (!primed.current) {
      items.forEach((n) => seenIds.current.add(n.id));
      primed.current = true;
      return;
    }
    for (const n of items) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      if (!n.read) {
        toast(n.title, {
          description: n.body?.slice(0, 120) || undefined,
          action: n.campaignId
            ? {
                label: "Open CRM",
                onClick: () =>
                  router.push(`/campaigns/${n.campaignId}/crm`),
              }
            : undefined,
        });
      }
    }
  }, [items, router]);

  const markAllRead = async () => {
    try {
      await patch("/api/notifications", { arg: { markAllRead: true } });
      mutate();
    } catch {
      toast.error("Could not mark notifications as read");
    }
  };

  const openNotif = async (n) => {
    try {
      if (!n.read) {
        await patch("/api/notifications", { arg: { id: n.id } });
        mutate();
      }
    } catch {

    }
    if (n.campaignId) {
      router.push(`/campaigns/${n.campaignId}/crm`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-8 w-8 p-0 border-black"
          aria-label="Notifications"
        >
          <NotificationBellIcon className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-[11px] text-blue-600 hover:underline"
              onClick={markAllRead}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400">
            No notifications yet
          </div>
        ) : (
          items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={`flex flex-col items-start gap-0.5 cursor-pointer py-2 ${
                !n.read ? "bg-blue-50/80" : ""
              }`}
              onClick={() => openNotif(n)}
            >
              <span className="text-xs font-medium leading-snug">{n.title}</span>
              {n.body ? (
                <span className="text-[11px] text-gray-500 line-clamp-2">
                  {n.body}
                </span>
              ) : null}
              <span className="text-[10px] text-gray-400">
                {DateTime.fromISO(
                  typeof n.created === "string"
                    ? n.created
                    : new Date(n.created).toISOString(),
                ).toRelative()}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
