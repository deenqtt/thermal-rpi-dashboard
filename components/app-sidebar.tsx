"use client";
import { Home, Settings, Thermometer, Wifi, HardDrive } from "lucide-react";
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

// Menu items
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

// NEW: WiFi interfaces
interface WiFiNetwork {
  ssid: string;
  connection_name?: string;
  ip_address?: string;
  signal_strength?: string;
}

interface WiFiStatus {
  connected: boolean;
  current_network?: WiFiNetwork;
  saved_networks: Array<{
    ssid: string;
    connection_name?: string;
    is_current: boolean;
  }>;
  device_state: string;
}

interface WiFiStatusResponse {
  action: string;
  status: string;
  wifi_status: WiFiStatus;
  timestamp: string;
}

type MqttStatus = "connecting" | "connected" | "disconnected";

export function AppSidebar() {
  // Real-time state
  const [thermalData, setThermalData] = useState<ThermalData | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // NEW: WiFi state
  const [wifiStatus, setWifiStatus] = useState<WiFiStatus | null>(null);
  const [wifiLastUpdate, setWifiLastUpdate] = useState<string>("");

  // ENHANCED MQTT CONNECTION MANAGEMENT WITH WIFI
  useEffect(() => {
    const mqttClient = getMQTTClient();

    const initializeMQTT = async () => {
      try {
        // Check if already connected
        if (mqttClient.isConnected()) {
          setMqttStatus("connected");
          console.log("Sidebar: Using existing MQTT connection");
          // Subscribe to thermal topic
          mqttClient.subscribe("sensors/thermal_stream");
          // NEW: Subscribe to WiFi status response
          mqttClient.subscribe("rpi/wifi/status/response");
          return;
        }

        // If not connected, try to connect
        setMqttStatus("connecting");
        await mqttClient.connect();
        setMqttStatus("connected");

        // Subscribe to topics
        mqttClient.subscribe("sensors/thermal_stream");
        // NEW: Subscribe to WiFi status
        mqttClient.subscribe("rpi/wifi/status/response");
        console.log(
          "Sidebar: MQTT connected and subscribed to thermal + wifi topics"
        );
      } catch (error) {
        console.error("Sidebar: MQTT connection failed:", error);
        setMqttStatus("disconnected");

        // Auto-retry after 5 seconds
        setTimeout(() => {
          console.log("Sidebar: Retrying MQTT connection...");
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

    // ENHANCED MQTT Message handler
    const handleMQTTMessage = (event: CustomEvent) => {
      const { topic, payload } = event.detail;

      if (topic === "sensors/thermal_stream") {
        try {
          const data = JSON.parse(payload);

          // Process thermal data - same as dashboard
          const processedData: ThermalData = {
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

          setThermalData(processedData);
          setLastUpdate(new Date().toLocaleTimeString("id-ID"));
          setMqttStatus("connected"); // Confirm connection when receiving data
        } catch (error) {
          console.error("Sidebar: Error parsing thermal data:", error);
        }
      }
      // NEW: Handle WiFi status response
      else if (topic === "rpi/wifi/status/response") {
        try {
          const data: WiFiStatusResponse = JSON.parse(payload);
          if (data.status === "success") {
            setWifiStatus(data.wifi_status);
            setWifiLastUpdate(new Date().toLocaleTimeString("id-ID"));
            console.log("Sidebar: WiFi Status Updated:", data.wifi_status);
          }
        } catch (error) {
          console.error("Sidebar: Error parsing WiFi status:", error);
        }
      }
    };

    // Initialize MQTT
    initializeMQTT();

    // NEW: WiFi status polling functions
    const requestWiFiStatus = () => {
      if (mqttClient.isConnected()) {
        console.log("Sidebar: Requesting WiFi status...");
        mqttClient.publish("rpi/wifi/status/get", JSON.stringify({}));
      }
    };

    // Request initial WiFi status after connection established
    const initialWiFiRequest = setTimeout(() => {
      if (mqttStatus === "connected") {
        requestWiFiStatus();
      }
    }, 2000);

    // Set up periodic WiFi status request (every 10 seconds)
    const wifiInterval = setInterval(() => {
      if (mqttStatus === "connected") {
        requestWiFiStatus();
      }
    }, 10000);

    // Set up periodic connection check
    const connectionInterval = setInterval(checkConnection, 3000);

    // Add event listener
    window.addEventListener("mqttMessage", handleMQTTMessage as EventListener);

    return () => {
      clearTimeout(initialWiFiRequest);
      clearInterval(connectionInterval);
      clearInterval(wifiInterval); // Clear WiFi polling interval
      window.removeEventListener(
        "mqttMessage",
        handleMQTTMessage as EventListener
      );
      // DON'T disconnect here - let the connection persist across pages
      console.log("Sidebar cleanup: keeping MQTT connection alive");
    };
  }, [mqttStatus]);

  return (
    <Sidebar variant="inset" className="bg-white border-r border-gray-200/80">
      {/* Header Section */}
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
            {/* Temperature Card - Enhanced */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/60 rounded-lg px-3 py-3 border border-blue-200/50">
              <p className="text-xs text-blue-600 font-medium mb-1">
                Average Temperature
              </p>
              <p className="text-xl font-bold text-blue-900">
                {thermalData
                  ? `${thermalData.thermal_data.statistics.avg_temp.toFixed(
                      1
                    )}°C`
                  : "--"}
              </p>
              {thermalData && (
                <p className="text-xs text-blue-600 mt-1">
                  Range:{" "}
                  {thermalData.thermal_data.statistics.min_temp.toFixed(1)}° -{" "}
                  {thermalData.thermal_data.statistics.max_temp.toFixed(1)}°C
                </p>
              )}
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

            {/* NEW: Enhanced WiFi Status Card */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg px-3 py-3 border border-green-200/60">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  WiFi Status
                </span>
              </div>

              {wifiStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-600">Connection:</span>
                    <div
                      className={`flex items-center gap-1 ${
                        wifiStatus.connected ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          wifiStatus.connected ? "bg-green-500" : "bg-red-500"
                        }`}
                      ></div>
                      <span className="text-xs font-medium">
                        {wifiStatus.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  </div>

                  {wifiStatus.connected && wifiStatus.current_network && (
                    <div>
                      <p className="text-sm font-bold text-green-900 truncate mb-1">
                        {wifiStatus.current_network.ssid}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-green-600">IP:</span>
                          <span className="font-mono text-green-800 text-xs">
                            {wifiStatus.current_network.ip_address || "--"}
                          </span>
                        </div>
                        {wifiStatus.current_network.signal_strength && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-green-600">Signal:</span>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-2 bg-green-200 rounded-sm overflow-hidden">
                                <div
                                  className="h-full bg-green-500 transition-all duration-300"
                                  style={{
                                    width: `${Math.min(
                                      parseInt(
                                        wifiStatus.current_network
                                          .signal_strength
                                      ) || 0,
                                      100
                                    )}%`,
                                  }}
                                ></div>
                              </div>
                              <span className="font-bold text-green-800 text-xs">
                                {wifiStatus.current_network.signal_strength}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!wifiStatus.connected && (
                    <p className="text-sm text-red-600 font-medium">
                      No WiFi Connection
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-600">
                    Loading WiFi status...
                  </span>
                </div>
              )}

              {wifiLastUpdate && (
                <p className="text-xs text-green-500 mt-2 border-t border-green-200 pt-1">
                  Updated: {wifiLastUpdate}
                </p>
              )}
            </div>
          </div>
        </SidebarGroup>
      </SidebarContent>

      {/* Enhanced Footer Section */}
      <SidebarFooter className="px-4 py-4 bg-gradient-to-t from-gray-50/50 to-transparent">
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200/60 shadow-sm">
          <Avatar className="w-9 h-9 ring-2 ring-blue-100">
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold">
              R2
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {thermalData?.device_name || "thermal_cam_rpi2"}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 truncate font-mono">
                {wifiStatus?.connected && wifiStatus.current_network
                  ? `WiFi: ${wifiStatus.current_network.ssid}`
                  : "WiFi: Disconnected"}
              </p>
              {wifiStatus?.connected &&
                wifiStatus.current_network?.signal_strength && (
                  <span className="text-xs text-green-600 font-bold">
                    {wifiStatus.current_network.signal_strength}%
                  </span>
                )}
            </div>
          </div>
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full shadow-sm ${
                wifiStatus?.connected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            {wifiStatus?.connected && (
              <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-75"></div>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
