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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wifi } from "lucide-react";
import { MQTTConfig } from "@/lib/types";

interface MQTTConfigProps {
  config: MQTTConfig;
  onUpdate: (field: keyof MQTTConfig, value: any) => void;
  disabled?: boolean;
}

export function MQTTConfigComponent({
  config,
  onUpdate,
  disabled = false,
}: MQTTConfigProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Wifi className="h-5 w-5" />
          <span>MQTT Configuration</span>
        </CardTitle>
        <CardDescription>
          Configure MQTT broker connection settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="broker_host">Broker Host</Label>
            <Input
              id="broker_host"
              value={config.broker_host}
              onChange={(e) => onUpdate("broker_host", e.target.value)}
              placeholder="192.168.0.138"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="broker_port">Port</Label>
            <Input
              id="broker_port"
              type="number"
              value={config.broker_port}
              onChange={(e) =>
                onUpdate("broker_port", parseInt(e.target.value))
              }
              placeholder="1883"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={config.username || ""}
              onChange={(e) => onUpdate("username", e.target.value || null)}
              placeholder="Optional"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={config.password || ""}
              onChange={(e) => onUpdate("password", e.target.value || null)}
              placeholder="Optional"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="keepalive">Keep Alive (seconds)</Label>
            <Input
              id="keepalive"
              type="number"
              value={config.keepalive}
              onChange={(e) => onUpdate("keepalive", parseInt(e.target.value))}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qos">QoS Level</Label>
            <Select
              value={config.qos.toString()}
              onValueChange={(value) => onUpdate("qos", parseInt(value))}
              disabled={disabled}
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
      </CardContent>
    </Card>
  );
}
