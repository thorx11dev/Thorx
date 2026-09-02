import { useState } from "react";
import ThorxSpinner from "@/components/ui/thorx-spinner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, DollarSign, BarChart3, Zap, AlertCircle } from "lucide-react";

interface HilltopAdsConfig {
  id: string;
  apiKey: string;
  publisherId: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
}

interface HilltopAdsZone {
  id: string;
  zoneId: string;
  siteName: string;
  zoneName: string;
  adFormat: string;
  status: string;
  totalImpressions: number;
  totalClicks: number;
  totalRevenue: string;
}

export default function HilltopAdsAdmin() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [publisherId, setPublisherId] = useState("");

  const { data: config, isLoading: configLoading, isError: configError } = useQuery<HilltopAdsConfig | null>({
    queryKey: ["/api/hilltopads/config"],
  });

  const { data: zones, isLoading: zonesLoading, isError: zonesError } = useQuery<HilltopAdsZone[]>({
    queryKey: ["/api/hilltopads/zones"],
  });

  const { data: revenueData, isError: revenueError } = useQuery<{ totalRevenue: string }>({
    queryKey: ["/api/hilltopads/revenue"],
  });

  const { data: balanceData, isError: balanceError } = useQuery<{ balance: number }>({
    queryKey: ["/api/hilltopads/balance"],
    enabled: !!config?.apiKey,
  });

  const createConfigMutation = useMutation({
    mutationFn: async (data: { apiKey: string; publisherId: string }) => {
      const response = await apiRequest("POST", "/api/hilltopads/config", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hilltopads/config"] });
      toast({
        title: "Success",
        description: "HilltopAds configuration saved",
      });
      setApiKey("");
      setPublisherId("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  const syncInventoryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/hilltopads/sync/inventory");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hilltopads/zones"] });
      toast({
        title: "Success",
        description: "Inventory synced successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync inventory",
        variant: "destructive",
      });
    },
  });

  const syncStatsMutation = useMutation({
    mutationFn: async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      const response = await apiRequest("POST", "/api/hilltopads/sync/stats", {
        startDate: dateStr,
        endDate: dateStr
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hilltopads/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hilltopads/revenue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hilltopads/zones"] });
      toast({
        title: "Success",
        description: "Statistics synced successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync statistics",
        variant: "destructive",
      });
    },
  });

  const handleSaveConfig = () => {
    if (!apiKey) {
      toast({
        title: "Error",
        description: "API key is required",
        variant: "destructive",
      });
      return;
    }

    createConfigMutation.mutate({ apiKey, publisherId });
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ThorxSpinner size={32} data-testid="loading-spinner" />
      </div>
    );
  }

  if (configError || zonesError || revenueError || balanceError) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-3 text-destructive">
        <AlertCircle className="h-6 w-6 shrink-0" />
        <span className="font-semibold">Failed to load HilltopAds data. Check your network or configuration and try again.</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="page-title">HilltopAds Management</h1>
        <p className="text-muted-foreground">Configure and manage your HilltopAds integration</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="total-revenue">
              ${revenueData?.totalRevenue || "0.00"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="current-balance">
              ${balanceData?.balance?.toFixed(2) || "0.00"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Active Zones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="active-zones">
              {zones?.filter(z => z.status === "active").length || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {!config ? (
        <Card>
          <CardHeader>
            <CardTitle>Setup HilltopAds</CardTitle>
            <CardDescription>Enter your HilltopAds API credentials to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key *</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your HilltopAds API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                data-testid="input-api-key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publisher-id">Publisher ID (Optional)</Label>
              <Input
                id="publisher-id"
                placeholder="Enter your publisher ID"
                value={publisherId}
                onChange={(e) => setPublisherId(e.target.value)}
                data-testid="input-publisher-id"
              />
            </div>
            <Button 
              onClick={handleSaveConfig} 
              disabled={createConfigMutation.isPending}
              data-testid="button-save-config"
            >
              {createConfigMutation.isPending && <ThorxSpinner size={16} className="mr-2" />}
              Save Configuration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Configuration Status</CardTitle>
              <CardDescription>Your HilltopAds integration is active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium" data-testid="config-status">
                    {config.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Synced</p>
                  <p className="font-medium" data-testid="last-synced">
                    {config.lastSyncedAt 
                      ? new Date(config.lastSyncedAt).toLocaleString()
                      : "Never"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => syncInventoryMutation.mutate()}
                  disabled={syncInventoryMutation.isPending}
                  variant="outline"
                  data-testid="button-sync-inventory"
                >
                  {syncInventoryMutation.isPending && <ThorxSpinner size={16} className="mr-2" />}
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Inventory
                </Button>
                <Button
                  onClick={() => syncStatsMutation.mutate()}
                  disabled={syncStatsMutation.isPending}
                  variant="outline"
                  data-testid="button-sync-stats"
                >
                  {syncStatsMutation.isPending && <ThorxSpinner size={16} className="mr-2" />}
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Stats
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ad Zones</CardTitle>
              <CardDescription>Manage your advertising zones</CardDescription>
            </CardHeader>
            <CardContent>
              {zonesLoading ? (
                <div className="flex justify-center py-4">
                  <ThorxSpinner size={24} />
                </div>
              ) : zones && zones.length > 0 ? (
                <div className="space-y-3">
                  {zones.map((zone) => (
                    <div 
                      key={zone.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`zone-${zone.zoneId}`}
                    >
                      <div>
                        <p className="font-medium">{zone.zoneName}</p>
                        <p className="text-sm text-muted-foreground">
                          {zone.siteName} • {zone.adFormat}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">${zone.totalRevenue}</p>
                        <p className="text-xs text-muted-foreground">
                          {zone.totalImpressions.toLocaleString()} impressions
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4" data-testid="no-zones">
                  No zones found. Click "Sync Inventory" to load your zones.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
