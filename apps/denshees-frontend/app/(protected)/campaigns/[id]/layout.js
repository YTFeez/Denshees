"use client";

import { useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ExclamationCircleIcon,
  PauseIcon,
  PlayIcon,
} from "mage-icons-react/bulk";
import { ArrowLeftIcon } from "mage-icons-react/stroke";
import { toast } from "sonner";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { Button } from "@/components/ui/button";
import StatusChip from "@/components/ui/status-chip";
import useCampaignStore from "@/store/campaign.store";
import fetcher from "@/lib/fetcher";
import { patch } from "@/lib/apis";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function CampaignLayout({ children }) {
  const params = useParams();
  const pathname = usePathname();
  const campaignId = params.id;

  const { currentCampaign, setCurrentCampaign } = useCampaignStore();

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  
  const {
    data: campaignData,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(campaignId ? `/api/campaign/${campaignId}` : null, fetcher, {
    onSuccess: (data) => {
      setCurrentCampaign(data);
    },
  });

  
  const { trigger: updateStatus } = useSWRMutation(
    `/api/campaign/${campaignId}`,
    patch,
    {
      
      onMutate: async (newData) => {
        
        const previousCampaign = currentCampaign;

        
        setCurrentCampaign({ ...currentCampaign, status: newData.status });

        
        return { previousCampaign };
      },
      
      onError: (error, data, context) => {
        
        setCurrentCampaign(context.previousCampaign);
        toast.error(
          `Failed to ${data.status === "RUNNING" ? "start" : "pause"} campaign`,
        );
      },
      
      onSuccess: (data, variables) => {
        toast.success(
          `Campaign ${
            variables.status === "RUNNING" ? "started" : "paused"
          } successfully`,
        );
        mutate(); 
      },
    },
  );

  
  const hasEmails =
    currentCampaign?.campaignEmailCredentials &&
    currentCampaign.campaignEmailCredentials.length > 0;

  
  const handleStatusToggle = async () => {
    if (isUpdatingStatus || !currentCampaign) return;

    
    if (!hasEmails && currentCampaign.status !== "RUNNING") {
      toast.error("Cannot start campaign: No email accounts configured");
      return;
    }

    setIsUpdatingStatus(true);

    const newStatus =
      currentCampaign.status === "RUNNING" ? "PAUSED" : "RUNNING";

    try {
      await updateStatus({ status: newStatus });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  
  const tabs = [
    { name: "Leads", href: `/campaigns/${campaignId}`, tourId: "tour-tab-leads" },
    { name: "CRM", href: `/campaigns/${campaignId}/crm`, tourId: "tour-tab-crm" },
    { name: "Builder", href: `/campaigns/${campaignId}/builder`, tourId: "tour-tab-builder" },
    { name: "Analytics", href: `/campaigns/${campaignId}/analytics`, tourId: "tour-tab-analytics" },
    { name: "Settings", href: `/campaigns/${campaignId}/settings` },
  ];

  
  const isTabActive = (href) => pathname === href;

  
  const isStartButtonDisabled =
    isUpdatingStatus ||
    !currentCampaign ||
    (!hasEmails && currentCampaign.status !== "RUNNING");

  return (
    <div className="space-y-6">
      <div className="header">
        {}
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/campaigns" className="shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeftIcon className="w-[18px] h-[18px]" />
            </Button>
          </Link>
          <h1 className="text-xl md:text-2xl font-bold truncate min-w-0">
            {isLoading
              ? "Loading..."
              : currentCampaign?.title || "Campaign Details"}
          </h1>
          {!isLoading && currentCampaign && (
            <StatusChip status={currentCampaign.status} className="shrink-0" />
          )}
        </div>

        {}
        {error && (
          <div className="border border-red-300 bg-red-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-red-800">Failed to load campaign details</p>
          </div>
        )}

        {}
        <div>
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2">
            {}
            <div className="flex border-b border-black overflow-x-auto scrollbar-none">
              {tabs.map((tab) => (
                <Link
                  key={tab.name}
                  id={tab.tourId}
                  href={tab.href}
                  className={`inline-flex items-center px-3 md:px-4 py-2 border-b-2 text-sm font-medium whitespace-nowrap ${
                    isTabActive(tab.href)
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {tab.name}
                </Link>
              ))}
            </div>

            {!isLoading && currentCampaign && (
              <div className="shrink-0">
                {!hasEmails && currentCampaign.status !== "RUNNING" ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            disabled={true}
                            variant="default"
                            size="sm"
                            className="opacity-70 w-full md:w-auto"
                          >
                            <PlayIcon className="w-4 h-4 mr-2" />
                            Start Campaign
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-white border border-black p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <div className="flex items-center">
                          <ExclamationCircleIcon className="w-3.5 h-3.5 mr-2 text-amber-500" />
                          <p>Configure email accounts in Settings first</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    onClick={handleStatusToggle}
                    disabled={isUpdatingStatus}
                    size="sm"
                    className="w-full md:w-auto"
                    variant={
                      currentCampaign.status === "RUNNING"
                        ? "destructive"
                        : "default"
                    }
                  >
                    {currentCampaign.status === "RUNNING" ? (
                      <>
                        <PauseIcon className="w-4 h-4 mr-2" />
                        Pause Campaign
                      </>
                    ) : (
                      <>
                        <PlayIcon className="w-4 h-4 mr-2" />
                        Start Campaign
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {}
        {!isLoading &&
          currentCampaign &&
          !hasEmails &&
          currentCampaign.status !== "RUNNING" && (
            <div className="mt-4 border border-amber-300 bg-amber-50 p-3 rounded-none flex items-center">
              <ExclamationCircleIcon className="w-4 h-4 mr-2 text-amber-500" />
              <p className="text-sm text-amber-800">
                This campaign has no email accounts configured. Go to{" "}
                <Link
                  href={`/campaigns/${campaignId}/settings`}
                  className="underline font-medium"
                >
                  Settings
                </Link>{" "}
                to add email accounts before starting the campaign.
              </p>
            </div>
          )}
      </div>

      {}
      <div>{children}</div>
    </div>
  );
}
