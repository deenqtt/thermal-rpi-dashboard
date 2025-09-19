"use client";
import {
  Home,
  Settings,
  Thermometer,
  Wifi,
  Cpu,
  HardDrive,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { getMQTTClient } from "@/lib/mqtt";

// Menu items - SIMPLE 2 aja
const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Network Settings",
    url: "/settings",
    icon: Settings,
  },
];

// Interfaces for real-time data
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

export function AppSidebar() {
  // Real-time state
  const [thermalData, setThermalData] = useState<ThermalData | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [cpuUsage, setCpuUsage] = useState<number>(45);

  // Listen to existing MQTT connection (don't create new one)
  useEffect(() => {
    const mqttClient = getMQTTClient();

    // Check existing connection status
    const checkConnection = () => {
      if (mqttClient.isConnected()) {
        setMqttStatus("connected");
        // Don't subscribe again if already subscribed from dashboard
        console.log("Sidebar: Using existing MQTT connection");
      } else {
        setMqttStatus("disconnected");
        console.log("Sidebar: MQTT not connected yet");
      }
    };

    // Initial check
    checkConnection();

    // Listen for connection changes via custom events
    const handleConnectionChange = () => {
      checkConnection();
    };

    // Listen for MQTT messages (from dashboard connection)
    const handleMQTTMessage = (event: CustomEvent) => {
      const { topic, payload } = event.detail;
      if (topic === "sensors/thermal_stream") {
        try {
          const data = JSON.parse(payload);

          // Handle different payload structures - fix for real payload format
          const processedData: ThermalData = {
            device_id: data.device_id || "thermal_cam_rpi1",
            device_name: data.device_name || "Thermal Camera RPi1",
            location: data.location || "Room A",
            interface: data.interface || "spi",
            frame_count:
              data.thermal_data?.frame_count || data.frame_count || 0,
            thermal_data: {
              raw_array: [],
              statistics: data.thermal_data?.statistics || {
                min_temp: 0,
                max_temp: 0,
                avg_temp: 0,
                total_pixels: 4960,
              },
            },
            metadata: data.metadata || {
              resolution: "80x62",
              units: "celsius",
            },
          };

          setThermalData(processedData);
          setLastUpdate(new Date().toLocaleTimeString("id-ID"));
          setMqttStatus("connected"); // Update status when receiving data

          // Simulate CPU usage based on thermal activity
          const avgTemp = processedData.thermal_data.statistics.avg_temp;
          const simulatedCPU = Math.min(
            Math.max(Math.round((avgTemp - 20) * 2), 25),
            85
          );
          setCpuUsage(simulatedCPU);
        } catch (error) {
          console.error("Sidebar: Error parsing thermal data:", error);
        }
      }
    };

    // Periodic connection check
    const connectionInterval = setInterval(checkConnection, 2000);

    // Add event listeners
    window.addEventListener("mqttMessage", handleMQTTMessage as EventListener);

    return () => {
      clearInterval(connectionInterval);
      window.removeEventListener(
        "mqttMessage",
        handleMQTTMessage as EventListener
      );
      // Don't disconnect - let dashboard handle the connection
    };
  }, []);
  return (
    <Sidebar variant="inset" className="bg-white border-r border-gray-200/80">
      {/* Header Section - Clean & Minimal */}
      <SidebarHeader className="px-4 py-6 bg-gradient-to-br from-slate-50 to-blue-50/30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Thermometer className="w-5 h-5 text-white" />
            </div>
            <div
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                mqttStatus === "connected"
                  ? "bg-green-500"
                  : mqttStatus === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            >
              <div
                className={`w-2 h-2 bg-white rounded-full ${
                  mqttStatus === "connecting" ? "animate-pulse" : ""
                }`}
              ></div>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900 tracking-tight">
              Thermal RPi
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 border-0"
              >
                v1.0.0
              </Badge>
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  mqttStatus === "connected"
                    ? "text-green-600"
                    : mqttStatus === "connecting"
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    mqttStatus === "connected"
                      ? "bg-green-500 animate-pulse"
                      : mqttStatus === "connecting"
                      ? "bg-yellow-500 animate-spin"
                      : "bg-red-500"
                  }`}
                ></div>
                {mqttStatus === "connected"
                  ? "Live"
                  : mqttStatus === "connecting"
                  ? "Connecting"
                  : "Offline"}
              </div>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        {/* Navigation Menu */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className="rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 group"
                  >
                    <a
                      href={item.url}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <item.icon className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                      <span className="font-medium text-sm">{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-6 bg-gray-200/60" />

        {/* Device Status Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Live Status
          </SidebarGroupLabel>
          <div className="space-y-3">
            {/* Real-time Stats Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-lg px-3 py-2.5 border border-blue-200/50">
                <p className="text-xs text-blue-600 font-medium mb-0.5">
                  Temperature
                </p>
                <p className="text-lg font-bold text-blue-900">
                  {thermalData
                    ? `${thermalData.thermal_data.statistics.avg_temp.toFixed(
                        1
                      )}°C`
                    : "--"}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100/60 rounded-lg px-3 py-2.5 border border-green-200/50">
                <p className="text-xs text-green-600 font-medium mb-0.5">CPU</p>
                <p className="text-lg font-bold text-green-900">{cpuUsage}%</p>
              </div>
            </div>

            {/* Frame Counter Card */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg px-3 py-2.5 border border-purple-200/50">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  Frame Count
                </span>
              </div>
              <p className="text-lg font-bold text-purple-900">
                {thermalData ? `#${thermalData.frame_count}` : "--"}
              </p>
            </div>

            {/* Network Info Card */}
            <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg px-3 py-3 border border-gray-200/60">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="w-3.5 h-3.5 text-gray-600" />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Network
                </span>
              </div>
              <p className="text-sm font-mono text-gray-900 truncate mb-1">
                {thermalData?.device_id || "thermal_cam_rpi1"}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">MQTT Status</span>
                <div className="flex items-center gap-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      mqttStatus === "connected"
                        ? "bg-green-500"
                        : mqttStatus === "connecting"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  ></div>
                  <span
                    className={`text-xs font-medium ${
                      mqttStatus === "connected"
                        ? "text-green-600"
                        : mqttStatus === "connecting"
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {mqttStatus.charAt(0).toUpperCase() + mqttStatus.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer Section */}
      <SidebarFooter className="px-4 py-4 bg-gradient-to-t from-gray-50/50 to-transparent">
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200/60 shadow-sm">
          <Avatar className="w-9 h-9 ring-2 ring-blue-100">
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold">
              R1
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {thermalData?.device_name || "thermal_cam_rpi1"}
            </p>
            <p className="text-xs text-gray-500 truncate font-mono">
              {lastUpdate ? `Last sync: ${lastUpdate}` : "Waiting for data..."}
            </p>
          </div>
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full shadow-sm ${
                mqttStatus === "connected"
                  ? "bg-green-500"
                  : mqttStatus === "connecting"
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
            ></div>
            {mqttStatus === "connected" && (
              <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-75"></div>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
