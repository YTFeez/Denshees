"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { SettingsIcon, UserPlusIcon } from "mage-icons-react/bulk";
import { RefreshIcon } from "mage-icons-react/stroke";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import fetcher from "@/lib/fetcher";
import { post, patch } from "@/lib/apis";
import KanbanBoard from "@/components/campaigns/crm/kanban-board";
import StageManager from "@/components/campaigns/crm/stage-manager";
import DealDetailPanel from "@/components/campaigns/crm/deal-detail-panel";
import AddLeadDialog from "@/components/campaigns/add-lead-dialog";

export default function CampaignCRMPage() {
  const params = useParams();
  const campaignId = params.id;

  const [activeDeal, setActiveDeal] = useState(null);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [addLeadDialogOpen, setAddLeadDialogOpen] = useState(false);

  
  const {
    data: stages = [],
    mutate: mutateStages,
    isLoading: stagesLoading,
  } = useSWR(
    campaignId ? `/api/crm/stages?campaign=${campaignId}` : null,
    fetcher,
  );

  
  const {
    data: deals = [],
    mutate: mutateDeals,
    isLoading: dealsLoading,
  } = useSWR(
    campaignId ? `/api/crm/deals?campaign=${campaignId}` : null,
    fetcher,
  );

  
  const { data: activities = [], mutate: mutateActivities } = useSWR(
    selectedDeal ? `/api/crm/activities?deal=${selectedDeal.id}` : null,
    fetcher,
  );

  
  const { trigger: seedStages, isMutating: isSeeding } = useSWRMutation(
    "/api/crm/stages/seed",
    post,
    {
      onSuccess: () => {
        mutateStages();
        toast.success("Default stages created");
      },
      onError: () => {
        toast.error("Failed to create default stages");
      },
    },
  );

  
  const { trigger: createStage } = useSWRMutation(
    "/api/crm/stages",
    (url, { arg }) =>
      post(url, {
        arg: { ...arg, campaign: campaignId },
      }),
    {
      onSuccess: () => mutateStages(),
      onError: () => toast.error("Failed to create stage"),
    },
  );

  
  const handleUpdateStage = useCallback(
    async (stageId, data) => {
      try {
        await patch(`/api/crm/stages/${stageId}`, { arg: data });
        mutateStages();
      } catch {
        toast.error("Failed to update stage");
      }
    },
    [mutateStages],
  );

  
  const handleDeleteStage = useCallback(
    async (stageId) => {
      
      const dealsInStage = deals.filter((d) => d.stage === stageId);
      if (dealsInStage.length > 0) {
        toast.error("Cannot delete stage with deals. Move them first.");
        return;
      }
      try {
        const { default: instance } = await import("@/lib/axios");
        await instance.delete(`/api/crm/stages/${stageId}`);
        mutateStages();
        toast.success("Stage deleted");
      } catch {
        toast.error("Failed to delete stage");
      }
    },
    [deals, mutateStages],
  );

  
  const moveDealToStage = useCallback(
    async (dealId, fromStageId, toStageId) => {
      try {
        mutateDeals(
          (current) =>
            current?.map((d) =>
              d.id === dealId
                ? { ...d, stage: toStageId, stageLocked: true }
                : d,
            ),
          false,
        );

        await patch(`/api/crm/deals/${dealId}`, {
          arg: { stage: toStageId, stageLocked: true },
        });

        await post("/api/crm/activities", {
          arg: {
            deal: dealId,
            campaign: campaignId,
            type: "STAGE_CHANGE",
            from_stage: fromStageId,
            to_stage: toStageId,
            description: "",
          },
        });

        mutateDeals();
        if (selectedDeal?.id === dealId) {
          mutateActivities();
          setSelectedDeal((prev) =>
            prev
              ? { ...prev, stage: toStageId, stageLocked: true }
              : prev,
          );
        }
      } catch {
        mutateDeals();
        toast.error("Failed to move deal");
      }
    },
    [campaignId, mutateDeals, mutateActivities, selectedDeal],
  );

  const handleDeleteDeal = useCallback(
    async (dealId) => {
      try {
        const { default: instance } = await import("@/lib/axios");
        await instance.delete(`/api/crm/deals/${dealId}`);
        mutateDeals();
        setSelectedDeal(null);
        toast.success("Deal deleted");
      } catch {
        toast.error("Failed to delete deal");
      }
    },
    [mutateDeals],
  );

  const handleBulkSync = useCallback(async () => {
    if (!stages.length) {
      toast.error("Create stages first");
      return;
    }
    try {
      
      await post("/api/crm/stages/seed", { arg: { campaign: campaignId } });
      const emailAdded =
        stages.find((s) => s.key === "email_added") || stages[0];
      const result = await post("/api/crm/deals/bulk-create", {
        arg: {
          campaign: campaignId,
          defaultStageId: emailAdded.id,
        },
      });
      mutateDeals();
      mutateStages();
      toast.success(
        `Synced ${result?.created ?? 0} lead(s) into CRM (${result?.total ?? 0} total)`,
      );
    } catch {
      toast.error("Failed to sync leads");
    }
  }, [stages, campaignId, mutateDeals, mutateStages]);

  
  const handleAddActivity = useCallback(
    async (activityData) => {
      try {
        await post("/api/crm/activities", { arg: activityData });
        mutateActivities();
        toast.success("Activity logged");
      } catch {
        toast.error("Failed to log activity");
      }
    },
    [mutateActivities],
  );

  
  const handleDragStart = useCallback(
    (event) => {
      const { active } = event;
      const deal = deals.find((d) => d.id === active.id);
      setActiveDeal(deal || null);
    },
    [deals],
  );

  const handleDragOver = useCallback(() => {}, []);

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      setActiveDeal(null);

      if (!over) return;

      const dealId = active.id;
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) return;

      
      let targetStageId;
      if (over.data?.current?.type === "column") {
        targetStageId = over.id;
      } else if (over.data?.current?.type === "card") {
        const overDeal = deals.find((d) => d.id === over.id);
        targetStageId = overDeal?.stage;
      } else {
        
        targetStageId = over.id;
      }

      if (targetStageId && targetStageId !== deal.stage) {
        moveDealToStage(dealId, deal.stage, targetStageId);
      }
    },
    [deals, moveDealToStage],
  );

  
  const handleDealClick = useCallback((deal) => {
    setSelectedDeal(deal);
  }, []);

  
  const handlePanelStageChange = useCallback(
    (dealId, fromStageId, toStageId) => {
      moveDealToStage(dealId, fromStageId, toStageId);
    },
    [moveDealToStage],
  );

  
  const handleSeedStages = () => {
    seedStages({ campaign: campaignId });
  };

  
  const handleLeadAdded = useCallback(
    async ({ email }) => {
      if (stages.length === 0 || !email) return;
      try {
        await post("/api/crm/deals/create-for-lead", {
          arg: {
            campaign: campaignId,
            email,
            stageId: stages[0].id,
          },
        });
        mutateDeals();
      } catch {
        
      }
    },
    [stages, campaignId, mutateDeals],
  );

  const isLoading = stagesLoading || dealsLoading;

  
  if (!isLoading && stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="border border-black bg-white p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center max-w-md">
          <h3 className="text-lg font-bold mb-2">Set Up Your CRM Pipeline</h3>
          <p className="text-sm text-gray-500 mb-4">
            Create default pipeline stages to start tracking your leads through
            the sales process.
          </p>
          <Button onClick={handleSeedStages} disabled={isSeeding}>
            {isSeeding ? "Creating..." : "Create Default Stages"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {deals.length} deal{deals.length !== 1 ? "s" : ""} in pipeline
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddLeadDialogOpen(true)}
          >
            <UserPlusIcon className="w-3.5 h-3.5 mr-1.5" />
            Add Lead
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkSync}>
            Sync all leads
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              mutateStages();
              mutateDeals();
            }}
          >
            <RefreshIcon className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStageManagerOpen(true)}
          >
            <SettingsIcon className="w-3.5 h-3.5 mr-1.5" />
            Manage Stages
          </Button>
        </div>
      </div>

      {}
      {isLoading ? (
        <div className="flex items-center justify-center h-[500px] border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="border border-black p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-lg font-medium">Loading pipeline...</p>
          </div>
        </div>
      ) : (
        <KanbanBoard
          stages={stages}
          deals={deals}
          activeDeal={activeDeal}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDealClick={handleDealClick}
        />
      )}

      {}
      <StageManager
        open={stageManagerOpen}
        setOpen={setStageManagerOpen}
        stages={stages}
        onAdd={createStage}
        onUpdate={handleUpdateStage}
        onDelete={handleDeleteStage}
      />

      {}
      <AddLeadDialog
        open={addLeadDialogOpen}
        setOpen={setAddLeadDialogOpen}
        campaign={campaignId}
        onSuccess={handleLeadAdded}
      />

      {}
      <DealDetailPanel
        open={!!selectedDeal}
        onClose={() => setSelectedDeal(null)}
        deal={selectedDeal}
        stages={stages}
        activities={activities}
        onStageChange={handlePanelStageChange}
        onAddActivity={handleAddActivity}
        onDeleteDeal={handleDeleteDeal}
      />
    </div>
  );
}
