"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database } from "lucide-react";
import { DeviceConfig } from "@/lib/types";

interface DeviceConfigProps {
  config: DeviceConfig;
  onUpdate: (field: keyof DeviceConfig, value: string) => void;
  disabled?: boolean;
}

export function DeviceConfigComponent({
  config,
  onUpdate,
  disabled = false,
}: DeviceConfigProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="h-5 w-5" />
          <span>Device Configuration</span>
        </CardTitle>
        <CardDescription>
          Device identification and location settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="device_id">Device ID</Label>
          <Input
            id="device_id"
            value={config.device_id}
            onChange={(e) => onUpdate("device_id", e.target.value)}
            disabled={disabled}
            placeholder="thermal_cam_rpi1"
          />
          <p className="text-xs text-muted-foreground">
            Unique identifier for this thermal camera device
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="device_name">Device Name</Label>
          <Input
            id="device_name"
            value={config.device_name}
            onChange={(e) => onUpdate("device_name", e.target.value)}
            disabled={disabled}
            placeholder="Thermal Camera RPi1"
          />
          <p className="text-xs text-muted-foreground">
            Human-readable name for display purposes
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={config.location}
            onChange={(e) => onUpdate("location", e.target.value)}
            disabled={disabled}
            placeholder="Room A"
          />
          <p className="text-xs text-muted-foreground">
            Physical location of the thermal camera
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
