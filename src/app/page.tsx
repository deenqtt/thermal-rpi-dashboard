"use client";

import { useState, useEffect, useMemo, memo, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Thermometer,
  Activity,
  Database,
  Wifi,
  Clock,
  Server,
  Cpu,
  Signal,
  Eye,
  Pause,
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { getMQTTClient } from "@/lib/mqtt";

// --- INTERFACES & TYPES ---
interface ThermalStatistics {
  min_temp: number;
  max_temp: number;
  avg_temp: number;
  total_pixels: number;
}

interface ThermalData {
  device_id: string;
  device_name: string;
  location: string;
  interface: string;
  frame_count: number;
  thermal_data: {
    raw_array: number[][];
    statistics: ThermalStatistics;
  };
  metadata: {
    resolution: string;
    units: string;
  };
}

type MqttStatus = "connecting" | "connected" | "disconnected";

// --- HELPER FUNCTIONS ---
const getTemperatureColor = (
  temp: number,
  min: number,
  max: number
): string => {
  const normalized = Math.max(0, Math.min(1, (temp - min) / (max - min)));

  if (normalized < 0.25) {
    const b = Math.floor(normalized * 4 * 255);
    return `rgb(0, ${b}, 255)`;
  } else if (normalized < 0.5) {
    const r = (normalized - 0.25) * 4;
    return `rgb(0, 255, ${Math.floor((1 - r) * 255)})`;
  } else if (normalized < 0.75) {
    const g = (normalized - 0.5) * 4;
    return `rgb(${Math.floor(g * 255)}, 255, 0)`;
  } else {
    const y = (normalized - 0.75) * 4;
    return `rgb(255, ${Math.floor((1 - y) * 255)}, 0)`;
  }
};

const getStatusIcon = (status: MqttStatus) => {
  switch (status) {
    case "connected":
      return <div className="w-2 h-2 bg-emerald-500 rounded-full" />;
    case "connecting":
      return (
        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
      );
    case "disconnected":
      return <div className="w-2 h-2 bg-red-500 rounded-full" />;
    default:
      return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
  }
};

// --- SUB-COMPONENTS ---
interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "stable";
  isLoading: boolean;
}

const StatCard = memo(
  ({ title, value, description, icon, trend, isLoading }: StatCardProps) => (
    <Card className="border border-gray-200 bg-white hover:shadow-sm transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
              {icon}
              <span>{title}</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-20 bg-gray-100" />
            ) : (
              <div className="text-2xl font-bold text-gray-900">{value}</div>
            )}
            {description && (
              <p className="text-xs text-gray-500">{description}</p>
            )}
          </div>
          {trend && (
            <div className="flex items-center">
              {trend === "up" && (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              )}
              {trend === "down" && (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              {trend === "stable" && (
                <Minus className="w-4 h-4 text-gray-400" />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
);

StatCard.displayName = "StatCard";

// --- HEATMAP COMPONENT ---
interface ThermalHeatmapProps {
  data: number[][];
  stats: ThermalStatistics;
  frameCount: number;
  lastUpdate: string;
}

const ThermalHeatmap = memo(
  ({ data, stats, frameCount, lastUpdate }: ThermalHeatmapProps) => {
    const { min_temp, max_temp, avg_temp } = stats;
    const rows = data.length;
    const cols = data[0]?.length || 0;

    // Optimized heatmap generation
    const heatmapGrid = useMemo(() => {
      return data.flat().map((temp, index) => (
        <div
          key={index}
          className="w-full h-full border-0"
          style={{
            backgroundColor: getTemperatureColor(temp, min_temp, max_temp),
          }}
          title={`${temp.toFixed(2)}°C`}
        />
      ));
    }, [data, min_temp, max_temp]);

    return (
      <div className="space-y-4">
        {/* Heatmap Container */}
        <div className="aspect-video bg-gray-900 rounded-lg p-2 relative overflow-hidden">
          <div
            className="grid rounded-md overflow-hidden h-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
          >
            {heatmapGrid}
          </div>

          {/* Overlays */}
          <div className="absolute top-3 left-3 space-y-2">
            <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-white text-xs font-bold">
              Max: {max_temp.toFixed(1)}°C
            </div>
            <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-white text-xs font-bold">
              Min: {min_temp.toFixed(1)}°C
            </div>
          </div>

          <div className="absolute top-3 right-3">
            <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-white text-xs font-bold">
              Frame #{frameCount}
            </div>
          </div>

          <div className="absolute bottom-3 left-3">
            <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-white text-xs font-bold">
              Avg: {avg_temp.toFixed(1)}°C
            </div>
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded px-2 py-1 text-white text-xs font-bold">
            <Clock className="w-3 h-3" />
            {lastUpdate}
          </div>
        </div>

        {/* Temperature Scale */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2 border">
            <span className="text-xs font-medium text-gray-600">Cold</span>
            <div className="w-16 h-2 bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500 rounded-full"></div>
            <span className="text-xs font-medium text-gray-600">Hot</span>
          </div>
        </div>
      </div>
    );
  }
);

ThermalHeatmap.displayName = "ThermalHeatmap";

// Loading Placeholder
const HeatmapPlaceholder = memo(() => (
  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
    <div className="text-center text-gray-500">
      <Wifi className="h-12 w-12 mx-auto mb-3 text-gray-400" />
      <p className="text-lg font-medium">Waiting for thermal data</p>
      <p className="text-sm text-gray-400">
        Ensure sensor is connected and MQTT stream is active
      </p>
    </div>
  </div>
));

HeatmapPlaceholder.displayName = "HeatmapPlaceholder";

// Info Panel Component
interface InfoPanelProps {
  stats: ThermalStatistics | null;
  device: Pick<
    ThermalData,
    "device_id" | "location" | "interface" | "metadata"
  > | null;
  mqttStatus: MqttStatus;
  lastUpdate: string;
  fps: number;
}

const InfoPanel = memo(
  ({ stats, device, mqttStatus, lastUpdate, fps }: InfoPanelProps) => (
    <div className="space-y-6">
      {/* Live Statistics */}
      <Card className="border border-gray-200 bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900">
            <Activity className="w-5 h-5 text-gray-600" />
            Live Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-blue-700 mb-1">MIN TEMP</p>
              <p className="text-xl font-bold text-blue-900">
                {stats ? `${stats.min_temp.toFixed(1)}°C` : "--"}
              </p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-red-700 mb-1">MAX TEMP</p>
              <p className="text-xl font-bold text-red-900">
                {stats ? `${stats.max_temp.toFixed(1)}°C` : "--"}
              </p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center">
            <p className="text-xs font-medium text-emerald-700 mb-1">AVERAGE</p>
            <p className="text-2xl font-bold text-emerald-900">
              {stats ? `${stats.avg_temp.toFixed(1)}°C` : "--"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="border border-gray-200 bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900">
            <Server className="w-5 h-5 text-gray-600" />
            System Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              {getStatusIcon(mqttStatus)}
              <span className="text-sm font-medium text-gray-700">
                MQTT Status
              </span>
            </div>
            <span
              className={`text-sm font-medium ${
                mqttStatus === "connected"
                  ? "text-emerald-600"
                  : mqttStatus === "connecting"
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {mqttStatus.charAt(0).toUpperCase() + mqttStatus.slice(1)}
            </span>
          </div>

          {/* FPS Display */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                Frame Rate
              </span>
            </div>
            <span className="text-sm font-medium text-gray-900">{fps} FPS</span>
          </div>

          <Separator className="my-3" />

          {/* Device Details */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Device ID</span>
              <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-900">
                {device?.device_id || <Skeleton className="h-4 w-20" />}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Location</span>
              <span className="text-sm font-medium text-gray-900">
                {device?.location || <Skeleton className="h-4 w-16" />}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Interface</span>
              <span className="text-sm font-medium text-gray-900">
                {device?.interface || <Skeleton className="h-4 w-12" />}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Resolution</span>
              <span className="text-sm font-medium text-gray-900">
                {device?.metadata.resolution || (
                  <Skeleton className="h-4 w-14" />
                )}
              </span>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded">
            <span>Last Update</span>
            <span className="font-mono">{lastUpdate || "N/A"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
);

InfoPanel.displayName = "InfoPanel";

// --- MAIN DASHBOARD COMPONENT ---
export default function DashboardPage() {
  const [thermalData, setThermalData] = useState<ThermalData | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [fps, setFps] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [frameLimit, setFrameLimit] = useState<number>(5);
  const [autoReset, setAutoReset] = useState<boolean>(true);

  // Performance optimization
  const lastFrameTime = useRef<number>(0);
  const frameInterval = useMemo(() => 1000 / frameLimit, [frameLimit]);
  const fpsCounter = useRef<number[]>([]);

  // Frame counter reset
  const resetFrameCounter = useCallback(() => {
    if (thermalData) {
      setThermalData((prev) =>
        prev
          ? {
              ...prev,
              frame_count: 1,
            }
          : null
      );
    }
    console.log("Frame counter reset to 1");
  }, [thermalData]);

  // Auto reset when frame reaches 100
  useEffect(() => {
    if (autoReset && thermalData && thermalData.frame_count >= 100) {
      resetFrameCounter();
    }
  }, [thermalData?.frame_count, autoReset, resetFrameCounter]);

  // FIXED MQTT SETUP - NO DISCONNECT
  useEffect(() => {
    const mqttClient = getMQTTClient();

    const initializeMQTT = async () => {
      try {
        setMqttStatus("connecting");
        await mqttClient.connect();
        setMqttStatus("connected");
        mqttClient.subscribe("sensors/thermal_stream");
      } catch (error) {
        console.error("Dashboard: MQTT connection failed:", error);
        setMqttStatus("disconnected");
        // Retry after 5 seconds
        setTimeout(() => {
          initializeMQTT();
        }, 5000);
      }
    };

    // Connection status checker
    const checkConnection = () => {
      const isConnected = mqttClient.isConnected();
      const isConnecting = mqttClient.isConnecting();

      if (isConnecting && mqttStatus !== "connecting") {
        setMqttStatus("connecting");
      } else if (isConnected && mqttStatus !== "connected") {
        setMqttStatus("connected");
      } else if (!isConnected && !isConnecting && mqttStatus === "connected") {
        setMqttStatus("disconnected");
      }
    };

    const handleMQTTMessage = (event: CustomEvent) => {
      const { topic, payload } = event.detail;
      if (topic === "sensors/thermal_stream" && !isPaused) {
        const currentTime = Date.now();

        // FPS Control
        if (currentTime - lastFrameTime.current < frameInterval) {
          return; // Skip frame
        }

        try {
          const data = JSON.parse(payload);

          // Process thermal data
          const thermalData: ThermalData = {
            device_id: data.device_id || "thermal_cam_rpi2",
            device_name: data.device_name || "Thermal Camera USB",
            location: data.location || "Container",
            interface: data.interface || "usb",
            frame_count:
              data.thermal_data?.frame_count || data.frame_count || 0,
            thermal_data: {
              raw_array: [],
              statistics: data.thermal_data?.statistics || {
                min_temp: 20,
                max_temp: 30,
                avg_temp: 25,
                total_pixels: 4960,
              },
            },
            metadata: data.metadata || {
              resolution: "80x62",
              units: "celsius",
            },
          };

          // Reshape flat array to 2D grid
          const flatArray = data.thermal_data?.raw_array || [];
          const reshapedArray: number[][] = [];
          for (let i = 0; i < 62; i++) {
            reshapedArray.push(flatArray.slice(i * 80, (i + 1) * 80));
          }
          thermalData.thermal_data.raw_array = reshapedArray;

          setThermalData(thermalData);
          setLastUpdate(new Date().toLocaleTimeString("id-ID"));

          // Calculate FPS
          fpsCounter.current.push(currentTime);
          fpsCounter.current = fpsCounter.current.filter(
            (time) => currentTime - time < 1000
          );
          setFps(fpsCounter.current.length);

          lastFrameTime.current = currentTime;
        } catch (error) {
          console.error("Dashboard: Error parsing thermal data:", error);
        }
      }
    };

    // Initialize MQTT
    initializeMQTT();

    // Set up connection checker
    const connectionInterval = setInterval(checkConnection, 3000);

    // Add message listener
    window.addEventListener("mqttMessage", handleMQTTMessage as EventListener);

    return () => {
      clearInterval(connectionInterval);
      window.removeEventListener(
        "mqttMessage",
        handleMQTTMessage as EventListener
      );
    };
  }, [isPaused, frameInterval, mqttStatus]);

  const isLoading = !thermalData;
  const stats = thermalData?.thermal_data.statistics;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-8">
        {/* Header with Controls */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-gray-900">
              Thermal Dashboard
            </h1>
            <p className="text-gray-600">
              Real-time thermal monitoring and visualization
            </p>
          </div>

          {/* Enhanced Control Buttons */}
          <div className="flex items-center gap-3">
            {/* FPS Control */}
            <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
              <label className="text-sm font-medium text-gray-700">FPS:</label>
              <select
                value={frameLimit}
                onChange={(e) => setFrameLimit(Number(e.target.value))}
                className="text-sm border-0 bg-transparent focus:ring-0"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
            </div>

            {/* Auto Reset Toggle */}
            <button
              onClick={() => setAutoReset(!autoReset)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                autoReset
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : "bg-gray-100 text-gray-700 border border-gray-200"
              }`}
            >
              Auto Reset {autoReset ? "ON" : "OFF"}
            </button>

            {/* Manual Reset */}
            <button
              onClick={resetFrameCounter}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Frame
            </button>

            {/* Pause/Resume */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                isPaused
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-gray-600 hover:bg-gray-700 text-white"
              }`}
            >
              {isPaused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              {isPaused ? "Resume" : "Pause"}
            </button>

            <Badge
              variant={thermalData && !isPaused ? "default" : "secondary"}
              className="px-3 py-1"
            >
              {thermalData && !isPaused
                ? "LIVE"
                : isPaused
                ? "PAUSED"
                : "WAITING"}
            </Badge>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Average Temperature"
            value={stats ? `${stats.avg_temp.toFixed(1)}°C` : "--"}
            description={
              stats
                ? `Range: ${stats.min_temp.toFixed(
                    1
                  )} - ${stats.max_temp.toFixed(1)}°C`
                : "Waiting for data..."
            }
            icon={<Thermometer className="w-4 h-4" />}
            isLoading={isLoading}
          />

          <StatCard
            title="Connection Status"
            value={mqttStatus.charAt(0).toUpperCase() + mqttStatus.slice(1)}
            description="sensors/thermal_stream"
            icon={<Signal className="w-4 h-4" />}
            isLoading={false}
          />

          <StatCard
            title="Total Pixels"
            value={stats ? stats.total_pixels.toLocaleString() : "--"}
            description={`Interface: ${thermalData?.interface || "N/A"}`}
            icon={<Database className="w-4 h-4" />}
            isLoading={isLoading}
          />

          <StatCard
            title="Frame Rate"
            value={`${fps} FPS`}
            description={`Target: ${frameLimit} FPS`}
            icon={<Cpu className="w-4 h-4" />}
            isLoading={false}
          />
        </div>

        {/* Main Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Heatmap */}
          <Card className="lg:col-span-2 border border-gray-200 bg-white">
            <CardHeader className="pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2 text-gray-900">
                    <Thermometer className="w-5 h-5 text-gray-600" />
                    Live Thermal Heatmap
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Real-time visualization from{" "}
                    {thermalData?.device_name || "thermal sensor"}
                    {autoReset && " • Auto reset at frame 100"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              {thermalData ? (
                <ThermalHeatmap
                  data={thermalData.thermal_data.raw_array}
                  stats={thermalData.thermal_data.statistics}
                  frameCount={thermalData.frame_count}
                  lastUpdate={lastUpdate}
                />
              ) : (
                <HeatmapPlaceholder />
              )}
            </CardContent>
          </Card>

          {/* Info Panel */}
          <InfoPanel
            stats={stats || null}
            device={
              thermalData
                ? {
                    device_id: thermalData.device_id,
                    location: thermalData.location,
                    interface: thermalData.interface,
                    metadata: thermalData.metadata,
                  }
                : null
            }
            mqttStatus={mqttStatus}
            lastUpdate={lastUpdate}
            fps={fps}
          />
        </div>
      </div>
    </div>
  );
}
