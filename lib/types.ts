// lib/types.ts
export interface MQTTConfig {
  broker_host: string;
  broker_port: number;
  username: string | null;
  password: string | null;
  keepalive: number;
  qos: number;
}

export interface DeviceConfig {
  device_id: string;
  device_name: string;
  location: string;
}

export interface ThermalConfig {
  interface: string;
  spi_device: string;
  i2c_addr: string;
  usb_device: string;
  senxor_path: string;
  auto_detect: boolean;
}

export interface PublishingConfig {
  interval: number;
}

export interface ConfigData {
  mqtt: MQTTConfig;
  device: DeviceConfig;
  thermal: ThermalConfig;
  topic: string;
  publishing: PublishingConfig;
}

export interface MQTTResponse {
  status: "success" | "error";
  action?: string;
  timestamp: string;
  device_id: string;
  config?: ConfigData;
  message?: string;
  error?: string;
  restart_required?: boolean;
}
