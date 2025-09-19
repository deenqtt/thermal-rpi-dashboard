// src/app/settings/page.tsx

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Save,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wifi,
  Network,
  Database,
  Thermometer,
  Search,
  WifiOff,
  Trash2,
  Signal,
  Lock,
  X,
} from "lucide-react";
import { getMQTTClient } from "@/lib/mqtt";
import { ConfigData, MQTTResponse } from "@/lib/types";

interface NetworkConfig {
  [interfaceName: string]: {
    method: string;
    address?: string;
    netmask?: string;
    gateway?: string;
    "dns-nameservers"?: string;
  };
}

interface WiFiNetwork {
  ssid: string;
  security: string;
  signal: string;
}

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig | null>(
    null
  );
  const [wifiNetworks, setWifiNetworks] = useState<WiFiNetwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastResponse, setLastResponse] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [networkError, setNetworkError] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  // NEW: Redirect state
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null
  );

  // WiFi connection form
  const [wifiForm, setWifiForm] = useState({
    ssid: "",
    password: "",
    showPassword: false,
  });

  // Network form state
  const [networkForm, setNetworkForm] = useState({
    interface: "eth0",
    method: "dhcp",
    static_ip: "",
    netmask: "255.255.255.0",
    gateway: "",
    dns: "8.8.8.8 8.8.4.4",
  });

  const mqttClient = getMQTTClient();

  // Toast functions
  const addToast = (type: Toast["type"], title: string, message: string) => {
    const id = Date.now().toString();
    const newToast: Toast = { id, type, title, message };
    setToasts((prev) => [...prev, newToast]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // NEW: Redirect helper function
  const getRedirectURL = (newIP: string) => {
    const currentURL = new URL(window.location.href);
    const currentPort = currentURL.port;

    // Detect port - use current port or default
    let targetPort = currentPort || "3000";

    // Build new URL
    const portPart =
      (targetPort === "80" && currentURL.protocol === "http:") ||
      (targetPort === "443" && currentURL.protocol === "https:")
        ? ""
        : `:${targetPort}`;

    return `${currentURL.protocol}//${newIP}${portPart}${currentURL.pathname}`;
  };

  useEffect(() => {
    initializeMQTT();

    const handleMQTTMessage = (event: CustomEvent) => {
      const { topic, payload } = event.detail;
      if (topic === "rpi/config/response") {
        handleConfigResponse(payload);
      } else if (topic === "rpi/network/response") {
        handleNetworkResponse(payload);
      } else if (topic === "rpi/wifi/scan_response") {
        handleWiFiScanResponse(payload);
      } else if (topic === "rpi/wifi/connect_response") {
        handleWiFiConnectResponse(payload);
      } else if (topic === "rpi/wifi/disconnect_response") {
        handleWiFiDisconnectResponse(payload);
      } else if (topic === "rpi/wifi/delete_response") {
        handleWiFiDeleteResponse(payload);
      } else if (topic === "rpi/system/response") {
        handleSystemResponse(payload);
      }
    };

    window.addEventListener("mqttMessage", handleMQTTMessage as EventListener);
    return () =>
      window.removeEventListener(
        "mqttMessage",
        handleMQTTMessage as EventListener
      );
  }, []);

  const initializeMQTT = async () => {
    try {
      setLoading(true);
      setError("");
      await mqttClient.connect();
      setConnected(true);
      mqttClient.subscribe("rpi/config/response");
      mqttClient.subscribe("rpi/network/response");
      mqttClient.subscribe("rpi/wifi/scan_response");
      mqttClient.subscribe("rpi/wifi/connect_response");
      mqttClient.subscribe("rpi/wifi/disconnect_response");
      mqttClient.subscribe("rpi/wifi/delete_response");

      setTimeout(() => {
        loadConfig();
        loadNetworkConfig();
      }, 500);
    } catch (error) {
      console.error("MQTT connection failed:", error);
      setError(
        "Could not connect to MQTT broker. Check if RPi Config Manager is running."
      );
      setConnected(false);
      setLoading(false);
    }
  };

  const loadConfig = () => {
    if (connected) {
      console.log("Loading device config...");
      mqttClient.publish("rpi/config/get", "{}");
      setLoading(true);
    }
  };

  const loadNetworkConfig = () => {
    if (connected) {
      console.log("Loading network config...");
      mqttClient.publish("rpi/network/get", "{}");
    }
  };

  const scanWiFi = () => {
    if (connected) {
      console.log("Scanning WiFi networks...");
      setScanning(true);
      mqttClient.publish("rpi/wifi/scan", "{}");
    }
  };

  const connectWiFi = (ssid: string, password?: string) => {
    if (connected) {
      console.log(`Connecting to WiFi: ${ssid}`);
      setSaving(true);
      const payload = { ssid, ...(password && { password }) };
      mqttClient.publish("rpi/wifi/connect", JSON.stringify(payload));
    }
  };

  const disconnectWiFi = () => {
    if (connected) {
      console.log("Disconnecting WiFi...");
      setSaving(true);
      mqttClient.publish("rpi/wifi/disconnect", "{}");
    }
  };

  const deleteWiFi = (ssid: string) => {
    if (connected) {
      console.log(`Deleting WiFi: ${ssid}`);
      setSaving(true);
      mqttClient.publish("rpi/wifi/delete", JSON.stringify({ ssid }));
    }
  };
  const rebootDevice = () => {
    if (connected) {
      console.log("Sending reboot command...");
      mqttClient.publish("rpi/system/reboot", "{}");
      addToast("info", "Reboot", "Reboot command sent to device");
    }
  };

  const resetFactory = () => {
    if (connected) {
      console.log("Sending factory reset command...");
      mqttClient.publish("rpi/system/factory_reset", "{}");
      addToast("info", "Factory Reset", "Factory reset command sent to device");
    }
  };

  // Response handlers
  const handleConfigResponse = (payload: string) => {
    try {
      const response: MQTTResponse = JSON.parse(payload);
      setLastResponse(new Date().toLocaleTimeString());

      if (response.status === "success") {
        if (response.action === "get_config" && response.config) {
          setConfig(response.config);
          setError("");
          addToast(
            "success",
            "Config Loaded",
            "Device configuration loaded successfully"
          );
        } else if (response.action === "set_config") {
          setError("");
          addToast(
            "success",
            "Config Saved",
            "Device configuration saved successfully"
          );
        }
      } else {
        setError(response.error || "Unknown error occurred");
        addToast(
          "error",
          "Config Error",
          response.error || "Unknown error occurred"
        );
      }
    } catch (error) {
      console.error("Error parsing response:", error);
      setError("Failed to parse server response");
      addToast("error", "Parse Error", "Failed to parse server response");
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  // ENHANCED: Network response handler dengan auto redirect
  const handleNetworkResponse = (payload: string) => {
    try {
      const response: any = JSON.parse(payload);
      setLastResponse(new Date().toLocaleTimeString());

      if (response.status === "success") {
        if (
          response.action === "get_network_config" &&
          response.network_config
        ) {
          setNetworkConfig(response.network_config);
          setNetworkError("");
          addToast("success", "Network Status", "Network configuration loaded");

          const eth0Config = response.network_config.eth0;
          if (eth0Config) {
            setNetworkForm((prev) => ({
              ...prev,
              method: eth0Config.method || "dhcp",
              static_ip: eth0Config.address || "",
              netmask: eth0Config.netmask || "255.255.255.0",
              gateway: eth0Config.gateway || "",
              dns: eth0Config["dns-nameservers"] || "8.8.8.8 8.8.4.4",
            }));
          }
        } else if (response.action === "set_network_config") {
          setNetworkError("");

          // AUTO REDIRECT LOGIC - NEW
          if (response.method === "static" && response.static_ip) {
            const newIP = response.static_ip;

            addToast(
              "success",
              "Network Updated",
              `Static IP configured: ${newIP}. Redirecting...`
            );

            // Start countdown redirect
            let countdown = 5;
            setRedirectCountdown(countdown);

            const countdownInterval = setInterval(() => {
              countdown--;
              setRedirectCountdown(countdown);

              if (countdown <= 0) {
                clearInterval(countdownInterval);
                setRedirectCountdown(null);
                const newURL = getRedirectURL(newIP);
                console.log(`Auto redirecting to: ${newURL}`);
                window.location.href = newURL;
              }
            }, 1000);
          } else {
            addToast(
              "success",
              "Network Updated",
              `Network configuration applied: ${response.method}`
            );
          }

          setTimeout(() => loadNetworkConfig(), 2000);
        }
      } else {
        setNetworkError(response.error || "Unknown network error occurred");
        addToast(
          "error",
          "Network Error",
          response.error || "Network configuration failed"
        );
      }
    } catch (error) {
      console.error("Error parsing network response:", error);
      setNetworkError("Failed to parse network response");
      addToast("error", "Network Error", "Failed to parse network response");
    } finally {
      setSaving(false);
    }
  };

  const handleWiFiScanResponse = (payload: string) => {
    try {
      const response: any = JSON.parse(payload);
      if (response.status === "success") {
        setWifiNetworks(response.networks || []);
        addToast(
          "success",
          "WiFi Scan",
          `Found ${response.count || 0} networks`
        );
      } else {
        addToast(
          "error",
          "WiFi Scan Failed",
          response.error || "Failed to scan WiFi networks"
        );
      }
    } catch (error) {
      addToast("error", "WiFi Scan Error", "Failed to parse scan response");
    } finally {
      setScanning(false);
    }
  };

  const handleWiFiConnectResponse = (payload: string) => {
    try {
      const response: any = JSON.parse(payload);
      if (response.status === "success") {
        addToast(
          "success",
          "WiFi Connected",
          `Connected to ${response.ssid}. IP: ${response.ip_address}`
        );
        setWifiForm({ ssid: "", password: "", showPassword: false });
      } else {
        addToast(
          "error",
          "WiFi Connection Failed",
          response.error || "Failed to connect to WiFi"
        );
      }
    } catch (error) {
      addToast("error", "WiFi Error", "Failed to parse connection response");
    } finally {
      setSaving(false);
    }
  };

  const handleWiFiDisconnectResponse = (payload: string) => {
    try {
      const response: any = JSON.parse(payload);
      if (response.status === "success") {
        addToast(
          "success",
          "WiFi Disconnected",
          "WiFi disconnected successfully"
        );
      } else {
        addToast(
          "error",
          "WiFi Disconnect Failed",
          response.error || "Failed to disconnect WiFi"
        );
      }
    } catch (error) {
      addToast("error", "WiFi Error", "Failed to parse disconnect response");
    } finally {
      setSaving(false);
    }
  };

  const handleWiFiDeleteResponse = (payload: string) => {
    try {
      const response: any = JSON.parse(payload);
      if (response.status === "success") {
        addToast(
          "success",
          "WiFi Deleted",
          `Network ${response.ssid} deleted successfully`
        );
      } else {
        addToast(
          "error",
          "WiFi Delete Failed",
          response.error || "Failed to delete WiFi network"
        );
      }
    } catch (error) {
      addToast("error", "WiFi Error", "Failed to parse delete response");
    } finally {
      setSaving(false);
    }
  };

  const handleSystemResponse = (payload: string) => {
    try {
      const response: any = JSON.parse(payload);
      if (response.status === "success") {
        addToast(
          "success",
          "System",
          response.message || "Operation successful"
        );
      } else {
        addToast("error", "System Error", response.error || "Operation failed");
      }
    } catch (error) {
      addToast("error", "System Error", "Failed to parse system response");
    }
  };

  // Auto-retry loading
  useEffect(() => {
    if (connected && !config) {
      const retryTimer = setTimeout(() => {
        console.log("Retrying config load...");
        loadConfig();
      }, 3000);
      return () => clearTimeout(retryTimer);
    }
  }, [connected, config]);

  useEffect(() => {
    if (connected && !networkConfig) {
      const retryTimer = setTimeout(() => {
        console.log("Retrying network config load...");
        loadNetworkConfig();
      }, 3000);
      return () => clearTimeout(retryTimer);
    }
  }, [connected, networkConfig]);

  const saveConfig = () => {
    if (!config || !connected) return;
    setSaving(true);
    setError("");
    const payload = { config: config };
    mqttClient.publish("rpi/config/set", JSON.stringify(payload));
  };

  const saveNetworkConfig = () => {
    if (!connected) return;
    setSaving(true);
    setNetworkError("");
    const payload = {
      interface: networkForm.interface,
      method: networkForm.method,
      ...(networkForm.method === "static" && {
        static_ip: networkForm.static_ip,
        netmask: networkForm.netmask,
        gateway: networkForm.gateway,
        dns: networkForm.dns,
      }),
      reboot: false,
    };
    mqttClient.publish("rpi/network/set", JSON.stringify(payload));
  };

  const updateMQTTConfig = (field: keyof ConfigData["mqtt"], value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      mqtt: { ...config.mqtt, [field]: value },
    });
  };

  const updateDeviceConfig = (
    field: keyof ConfigData["device"],
    value: string
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      device: { ...config.device, [field]: value },
    });
  };

  const getSignalStrength = (signal: string) => {
    const strength = parseInt(signal);
    if (strength >= 70) return "text-green-600";
    if (strength >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* NEW: Redirect Modal */}
      {redirectCountdown !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md mx-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Switching to New IP
              </h3>
              <p className="text-gray-600 mb-4">
                Static IP configured successfully.
                <br />
                Redirecting to new address...
              </p>
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {redirectCountdown}
              </div>
              <p className="text-sm text-gray-500 mb-4">seconds remaining</p>
              <div className="space-y-2">
                <Button
                  onClick={() => {
                    setRedirectCountdown(null);
                    const newURL = getRedirectURL(networkForm.static_ip);
                    window.location.href = newURL;
                  }}
                  className="w-full"
                >
                  Redirect Now
                </Button>
                <Button
                  onClick={() => setRedirectCountdown(null)}
                  variant="outline"
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-4 rounded-lg shadow-lg border max-w-sm animate-in slide-in-from-right-full ${
              toast.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : toast.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex">
                {toast.type === "success" && (
                  <CheckCircle className="h-5 w-5 mr-2 mt-0.5" />
                )}
                {toast.type === "error" && (
                  <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
                )}
                {toast.type === "info" && (
                  <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-sm">{toast.title}</p>
                  <p className="text-sm opacity-90">{toast.message}</p>
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-2 opacity-60 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">
            Configure device, network, and WiFi parameters
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {connected ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm text-gray-600">
              MQTT {connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {lastResponse && (
            <Badge variant="outline" className="text-xs">
              Last update: {lastResponse}
            </Badge>
          )}
        </div>
      </div>

      {/* Connection Status Alert */}
      {!connected && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Not connected to MQTT broker. Make sure RPi Config Manager is
            running on the Raspberry Pi.
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Tabs */}
      <Tabs defaultValue="device" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="device" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Device
          </TabsTrigger>
          <TabsTrigger value="mqtt" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            MQTT
          </TabsTrigger>
          <TabsTrigger value="network" className="flex items-center gap-2">
            <Network className="w-4 h-4" />
            Network
          </TabsTrigger>
          <TabsTrigger value="wifi" className="flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            WiFi
          </TabsTrigger>
          <TabsTrigger value="thermal" className="flex items-center gap-2">
            <Thermometer className="w-4 h-4" />
            Thermal
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            System
          </TabsTrigger>
        </TabsList>

        {/* Device Configuration */}
        <TabsContent value="device" className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Device Configuration
              </CardTitle>
              <CardDescription>
                Device identification and location settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="device_id">Device ID</Label>
                      <Input
                        id="device_id"
                        value={config.device.device_id}
                        onChange={(e) =>
                          updateDeviceConfig("device_id", e.target.value)
                        }
                        disabled={saving}
                        placeholder="thermal_cam_rpi1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="device_name">Device Name</Label>
                      <Input
                        id="device_name"
                        value={config.device.device_name}
                        onChange={(e) =>
                          updateDeviceConfig("device_name", e.target.value)
                        }
                        disabled={saving}
                        placeholder="Thermal Camera RPi1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={config.device.location}
                      onChange={(e) =>
                        updateDeviceConfig("location", e.target.value)
                      }
                      disabled={saving}
                      placeholder="Room A"
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button
                      onClick={loadConfig}
                      disabled={!connected || loading}
                      variant="outline"
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${
                          loading ? "animate-spin" : ""
                        }`}
                      />
                      Reload
                    </Button>
                    <Button
                      onClick={saveConfig}
                      disabled={!connected || saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Configuration
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MQTT Configuration */}
        <TabsContent value="mqtt" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                MQTT Configuration
              </CardTitle>
              <CardDescription>
                Configure MQTT broker connection settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="broker_host">Broker Host</Label>
                      <Input
                        id="broker_host"
                        value={config.mqtt.broker_host}
                        onChange={(e) =>
                          updateMQTTConfig("broker_host", e.target.value)
                        }
                        placeholder="192.168.0.138"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="broker_port">Port</Label>
                      <Input
                        id="broker_port"
                        type="number"
                        value={config.mqtt.broker_port}
                        onChange={(e) =>
                          updateMQTTConfig(
                            "broker_port",
                            parseInt(e.target.value)
                          )
                        }
                        placeholder="1883"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={config.mqtt.username || ""}
                        onChange={(e) =>
                          updateMQTTConfig("username", e.target.value || null)
                        }
                        placeholder="Optional"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={config.mqtt.password || ""}
                        onChange={(e) =>
                          updateMQTTConfig("password", e.target.value || null)
                        }
                        placeholder="Optional"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="keepalive">Keep Alive (seconds)</Label>
                      <Input
                        id="keepalive"
                        type="number"
                        value={config.mqtt.keepalive}
                        onChange={(e) =>
                          updateMQTTConfig(
                            "keepalive",
                            parseInt(e.target.value)
                          )
                        }
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qos">QoS Level</Label>
                      <Select
                        value={config.mqtt.qos.toString()}
                        onValueChange={(value) =>
                          updateMQTTConfig("qos", parseInt(value))
                        }
                        disabled={saving}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 - At most once</SelectItem>
                          <SelectItem value="1">1 - At least once</SelectItem>
                          <SelectItem value="2">2 - Exactly once</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={saveConfig}
                      disabled={!connected || saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save MQTT Config
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Configuration */}
        <TabsContent value="network" className="space-y-6">
          {networkError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{networkError}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="w-5 h-5" />
                Ethernet Configuration
              </CardTitle>
              <CardDescription>
                Configure ethernet interface settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="interface">Interface</Label>
                  <Select
                    value={networkForm.interface}
                    onValueChange={(value) =>
                      setNetworkForm((prev) => ({ ...prev, interface: value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eth0">eth0 (Ethernet)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="method">IP Method</Label>
                  <Select
                    value={networkForm.method}
                    onValueChange={(value) =>
                      setNetworkForm((prev) => ({ ...prev, method: value }))
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dhcp">DHCP (Automatic)</SelectItem>
                      <SelectItem value="static">Static IP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {networkForm.method === "static" && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900">
                    Static IP Configuration
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="static_ip">IP Address</Label>
                      <Input
                        id="static_ip"
                        value={networkForm.static_ip}
                        onChange={(e) =>
                          setNetworkForm((prev) => ({
                            ...prev,
                            static_ip: e.target.value,
                          }))
                        }
                        placeholder="192.168.0.100"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="netmask">Netmask</Label>
                      <Input
                        id="netmask"
                        value={networkForm.netmask}
                        onChange={(e) =>
                          setNetworkForm((prev) => ({
                            ...prev,
                            netmask: e.target.value,
                          }))
                        }
                        placeholder="255.255.255.0"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gateway">Gateway</Label>
                      <Input
                        id="gateway"
                        value={networkForm.gateway}
                        onChange={(e) =>
                          setNetworkForm((prev) => ({
                            ...prev,
                            gateway: e.target.value,
                          }))
                        }
                        placeholder="192.168.0.1"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dns">DNS Servers</Label>
                      <Input
                        id="dns"
                        value={networkForm.dns}
                        onChange={(e) =>
                          setNetworkForm((prev) => ({
                            ...prev,
                            dns: e.target.value,
                          }))
                        }
                        placeholder="8.8.8.8 8.8.4.4"
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Current Network Status */}
              {networkConfig && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">
                    Current Network Status
                  </h4>
                  <div className="text-sm text-blue-800">
                    {Object.entries(networkConfig).map(([iface, config]) => (
                      <div key={iface} className="mb-2">
                        <span className="font-medium">{iface}:</span>{" "}
                        {config.method}
                        {config.address && <span> - {config.address}</span>}
                        {config.state && <span> ({config.state})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  onClick={loadNetworkConfig}
                  disabled={!connected || saving}
                  variant="outline"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${saving ? "animate-spin" : ""}`}
                  />
                  Reload
                </Button>
                <Button
                  onClick={saveNetworkConfig}
                  disabled={!connected || saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Apply Network Config
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WiFi Configuration */}
        <TabsContent value="wifi" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* WiFi Scanner */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="w-5 h-5" />
                      WiFi Scanner
                    </CardTitle>
                    <CardDescription>
                      Scan for available WiFi networks
                    </CardDescription>
                  </div>
                  <Button
                    onClick={scanWiFi}
                    disabled={scanning || !connected}
                    size="sm"
                  >
                    {scanning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {wifiNetworks.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">
                      {scanning
                        ? "Scanning..."
                        : "Click scan to find WiFi networks"}
                    </p>
                  ) : (
                    wifiNetworks.map((network, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          setWifiForm((prev) => ({
                            ...prev,
                            ssid: network.ssid,
                          }))
                        }
                      >
                        <div className="flex items-center gap-3">
                          <Signal
                            className={`h-4 w-4 ${getSignalStrength(
                              network.signal
                            )}`}
                          />
                          <div>
                            <p className="font-medium">{network.ssid}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              {network.security.includes("WPA") && (
                                <Lock className="h-3 w-3" />
                              )}
                              {network.security || "Open"}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {network.signal}%
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* WiFi Connection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" />
                  WiFi Connection
                </CardTitle>
                <CardDescription>Connect to a WiFi network</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wifi_ssid">Network Name (SSID)</Label>
                  <Input
                    id="wifi_ssid"
                    value={wifiForm.ssid}
                    onChange={(e) =>
                      setWifiForm((prev) => ({ ...prev, ssid: e.target.value }))
                    }
                    placeholder="Enter network name"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wifi_password">Password</Label>
                  <Input
                    id="wifi_password"
                    type={wifiForm.showPassword ? "text" : "password"}
                    value={wifiForm.password}
                    onChange={(e) =>
                      setWifiForm((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Enter password (optional for open networks)"
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show_password"
                    checked={wifiForm.showPassword}
                    onChange={(e) =>
                      setWifiForm((prev) => ({
                        ...prev,
                        showPassword: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <Label htmlFor="show_password" className="text-sm">
                    Show password
                  </Label>
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={() =>
                      connectWiFi(wifiForm.ssid, wifiForm.password)
                    }
                    disabled={!wifiForm.ssid || !connected || saving}
                    className="flex-1"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    Connect
                  </Button>

                  <Button
                    onClick={disconnectWiFi}
                    disabled={!connected || saving}
                    variant="outline"
                  >
                    <WifiOff className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Saved Networks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Saved Networks
              </CardTitle>
              <CardDescription>Manage saved WiFi connections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {wifiNetworks.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">
                    No saved networks found. Scan and connect to networks first.
                  </p>
                ) : (
                  wifiNetworks.slice(0, 5).map((network, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Wifi className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="font-medium">{network.ssid}</p>
                          <p className="text-xs text-gray-500">
                            {network.security || "Open network"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => connectWiFi(network.ssid)}
                          size="sm"
                          variant="outline"
                          disabled={saving}
                        >
                          Connect
                        </Button>
                        <Button
                          onClick={() => deleteWiFi(network.ssid)}
                          size="sm"
                          variant="outline"
                          disabled={saving}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Thermal Configuration */}
        <TabsContent value="thermal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="w-5 h-5" />
                Thermal Configuration
              </CardTitle>
              <CardDescription>
                Thermal sensor settings and parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Interface</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm">
                      {config.thermal.interface}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Auto Detect</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm">
                      {config.thermal.auto_detect ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Publishing Interval</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm">
                      {config.publishing.interval} seconds
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Topic</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm font-mono">
                      {config.topic}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                System Control
              </CardTitle>
              <CardDescription>Manage system-level operations</CardDescription>
            </CardHeader>
            <CardContent className="flex space-x-2">
              <Button onClick={rebootDevice} disabled={!connected || saving}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reboot
              </Button>
              <Button
                onClick={resetFactory}
                disabled={!connected || saving}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Factory Reset
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
