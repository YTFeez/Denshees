"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  EmailIcon,
  MessageSquareIcon,
  PhoneIcon,
  CalendarIcon,
  CheckSquareIcon,
  DotsHorizontalSquareIcon,
  AeroplaneIcon,
  TrashIcon,
} from "mage-icons-react/bulk";
import { ArrowRightIcon } from "mage-icons-react/stroke";
import { LinkedinIcon } from "mage-icons-react/social-color";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DateTime } from "luxon";
import fetcher from "@/lib/fetcher";
import { post } from "@/lib/apis";
import { toast } from "sonner";

const ACTIVITY_ICONS = {
  STAGE_CHANGE: ArrowRightIcon,
  STAGE_AUTO: ArrowRightIcon,
  NOTE: MessageSquareIcon,
  EMAIL_SENT: EmailIcon,
  EMAIL_OPENED: EmailIcon,
  REPLY: EmailIcon,
  BOUNCE: EmailIcon,
  CALL: PhoneIcon,
  MEETING: CalendarIcon,
  LINKEDIN: LinkedinIcon,
  TASK: CheckSquareIcon,
  OTHER: DotsHorizontalSquareIcon,
};

const ACTIVITY_COLORS = {
  STAGE_CHANGE: "bg-blue-100 text-blue-700",
  STAGE_AUTO: "bg-sky-100 text-sky-700",
  NOTE: "bg-yellow-100 text-yellow-700",
  EMAIL_SENT: "bg-gray-100 text-gray-700",
  EMAIL_OPENED: "bg-indigo-100 text-indigo-700",
  REPLY: "bg-purple-100 text-purple-700",
  BOUNCE: "bg-red-100 text-red-700",
  CALL: "bg-green-100 text-green-700",
  MEETING: "bg-orange-100 text-orange-700",
  LINKEDIN: "bg-blue-100 text-blue-700",
  TASK: "bg-teal-100 text-teal-700",
  OTHER: "bg-gray-100 text-gray-700",
};

const ACTIVITY_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "TASK", label: "Task" },
  { value: "OTHER", label: "Other" },
];

export default function DealDetailPanel({
  open,
  onClose,
  deal,
  stages,
  activities: legacyActivities,
  onStageChange,
  onAddActivity,
  onDeleteDeal,
}) {
  const [activityType, setActivityType] = useState("NOTE");
  const [activityDescription, setActivityDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const campaignId = deal?.campaign || deal?.campaignId;
  const leadId = deal?.expand?.lead?.id || deal?.leadId;

  const { data: threadData, mutate: mutateThread } = useSWR(
    open && deal?.id ? `/api/crm/deals/${deal.id}/thread` : null,
    fetcher,
    { refreshInterval: open ? 15000 : 0 },
  );

  useEffect(() => {
    if (!open) {
      setReplyText("");
      setActivityDescription("");
    }
  }, [open, deal?.id]);

  if (!deal) return null;

  const lead = deal.expand?.lead || threadData?.lead;
  const currentStage = stages.find((s) => s.id === deal.stage);

  const timeline =
    threadData?.timeline?.length > 0
      ? threadData.timeline
      : (legacyActivities || []).map((a) => ({
          id: a.id,
          kind: "activity",
          type: a.type,
          description: a.description,
          created: a.created,
          fromStage: a.expand?.from_stage?.name,
          toStage: a.expand?.to_stage?.name,
        }));

  const handleStageChange = (newStageId) => {
    if (newStageId !== deal.stage) {
      onStageChange(deal.id, deal.stage, newStageId);
    }
  };

  const handleAddActivity = async () => {
    if (!activityDescription.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddActivity({
        deal: deal.id,
        campaign: campaignId,
        type: activityType,
        description: activityDescription.trim(),
      });
      setActivityDescription("");
      setActivityType("NOTE");
      mutateThread();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !leadId || !campaignId) return;
    setIsReplying(true);
    try {
      await post(`/api/inbox/${campaignId}/reply`, {
        arg: {
          campaignEmailId: leadId,
          text: replyText.trim(),
        },
      });
      setReplyText("");
      toast.success("Reply sent");
      mutateThread();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to send reply");
    } finally {
      setIsReplying(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteDeal) return;
    if (!window.confirm("Delete this deal from the CRM pipeline?")) return;
    setIsDeleting(true);
    try {
      await onDeleteDeal(deal.id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] border-l-black border-l-2 p-0 overflow-hidden flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-black bg-white">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base">Lead Details</SheetTitle>
            {onDeleteDeal && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-red-600 border-red-300"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <TrashIcon className="w-3 h-3 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center text-sm font-bold">
                {(lead?.name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">
                  {lead?.name || "Unknown"}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {lead?.email || "-"}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Pipeline Stage
                {deal.stageLocked ? (
                  <span className="ml-2 text-[10px] text-amber-600">
                    (manual lock)
                  </span>
                ) : null}
              </label>
              <Select value={deal.stage} onValueChange={handleStageChange}>
                <SelectTrigger className="h-8 border-black text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black"
                      style={{
                        backgroundColor: currentStage?.color || "#6B7280",
                      }}
                    />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: stage.color || "#6B7280" }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 flex gap-3 text-xs text-gray-500">
              <div>
                <span className="font-medium text-gray-700">Status:</span>{" "}
                {lead?.status || "PENDING"}
              </div>
              <div>
                <span className="font-medium text-gray-700">Opened:</span>{" "}
                {(lead?.opened || 0) > 0 ? `Yes (${lead.opened})` : "No"}
              </div>
            </div>
          </div>

          {/* Reply from app */}
          <div className="p-4 border-b border-gray-200">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Reply
            </h4>
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply to this lead…"
              className="border-black text-sm min-h-[80px] resize-none"
              rows={3}
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={handleReply}
                disabled={!replyText.trim() || isReplying || !leadId}
                className="h-7 text-xs"
              >
                <AeroplaneIcon className="w-3 h-3 mr-1" />
                {isReplying ? "Sending…" : "Send reply"}
              </Button>
            </div>
          </div>

          {/* Log activity */}
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-2 mb-2">
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger className="h-7 w-[110px] border-black text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400">Log an activity</span>
            </div>
            <Textarea
              value={activityDescription}
              onChange={(e) => setActivityDescription(e.target.value)}
              placeholder="Add a note, log a call…"
              className="border-black text-sm min-h-[60px] resize-none"
              rows={2}
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={handleAddActivity}
                disabled={!activityDescription.trim() || isSubmitting}
                className="h-7 text-xs"
              >
                Log Activity
              </Button>
            </div>
          </div>

          {/* Unified timeline */}
          <div className="p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">
              Activity Timeline
            </h4>

            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No activities yet — deals sync when emails are sent
              </p>
            ) : (
              <div className="space-y-0">
                {timeline.map((item, idx) => {
                  const Icon =
                    ACTIVITY_ICONS[item.type] || DotsHorizontalSquareIcon;
                  const colorClass =
                    ACTIVITY_COLORS[item.type] || "bg-gray-100 text-gray-700";
                  const created = item.created
                    ? DateTime.fromISO(
                        typeof item.created === "string"
                          ? item.created
                          : new Date(item.created).toISOString(),
                      )
                    : null;

                  return (
                    <div key={item.id} className="flex gap-3 relative">
                      {idx < timeline.length - 1 && (
                        <div className="absolute left-[13px] top-[28px] bottom-0 w-px bg-gray-200" />
                      )}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
                      >
                        <Icon className="w-[13px] h-[13px]" />
                      </div>
                      <div className="flex-1 pb-4 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">
                            {(item.type || "OTHER").replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {created?.isValid ? created.toRelative() : ""}
                          </span>
                        </div>
                        {(item.fromStage || item.toStage) && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                            <span>{item.fromStage || "—"}</span>
                            <ArrowRightIcon className="w-[10px] h-[10px]" />
                            <span>{item.toStage || "—"}</span>
                          </div>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-words">
                            {String(item.description).replace(/<[^>]*>/g, "")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
