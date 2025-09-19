// lib/mqtt.ts
import Paho from "paho-mqtt";

interface MQTTConfig {
  broker: string;
  port: number;
  clientId?: string;
}

// Smart broker detection
function getMQTTBroker(): string {
  // Development: gunakan env variable
  if (process.env.NEXT_PUBLIC_MQTT_BROKER) {
    return process.env.NEXT_PUBLIC_MQTT_BROKER;
  }

  // Production: gunakan window.location.hostname jika tersedia (browser only)
  if (typeof window !== "undefined" && window.location) {
    return window.location.hostname;
  }

  // Fallback ke localhost
  return "localhost";
}

function getMQTTPort(): number {
  if (process.env.NEXT_PUBLIC_MQTT_PORT) {
    return parseInt(process.env.NEXT_PUBLIC_MQTT_PORT);
  }
  return 9000; // default websocket port
}

export class MQTTClient {
  private client: Paho.Client | null = null;
  private config: MQTTConfig;
  private connected: boolean = false;

  constructor() {
    this.config = {
      broker: getMQTTBroker(),
      port: getMQTTPort(),
      clientId: `thermal_dashboard_${Math.random().toString(36).substr(2, 9)}`,
    };

    console.log(`MQTT Config: ${this.config.broker}:${this.config.port}`);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create Paho MQTT client
        this.client = new Paho.Client(
          this.config.broker,
          this.config.port,
          this.config.clientId!
        );

        // Set callbacks
        this.client.onConnectionLost = this.onConnectionLost.bind(this);
        this.client.onMessageArrived = this.onMessageArrived.bind(this);

        // Connect options
        const connectOptions: Paho.ConnectionOptions = {
          onSuccess: () => {
            console.log("MQTT Connected successfully");
            this.connected = true;
            resolve();
          },
          onFailure: (error) => {
            console.error("MQTT Connection failed:", error);
            this.connected = false;
            reject(error);
          },
          keepAliveInterval: 60,
          cleanSession: true,
        };

        // Connect to broker
        this.client.connect(connectOptions);
      } catch (error) {
        console.error("MQTT Client creation failed:", error);
        reject(error);
      }
    });
  }

  private onConnectionLost(responseObject: Paho.MQTTError) {
    if (responseObject.errorCode !== 0) {
      console.log("MQTT Connection lost:", responseObject.errorMessage);
      this.connected = false;

      // Auto reconnect after 5 seconds
      setTimeout(() => {
        console.log("Attempting MQTT reconnection...");
        this.connect().catch(console.error);
      }, 5000);
    }
  }

  private onMessageArrived(message: Paho.Message) {
    console.log("MQTT Message received:", {
      topic: message.destinationName,
      payload: message.payloadString,
    });

    // Emit custom event untuk components
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mqttMessage", {
          detail: {
            topic: message.destinationName,
            payload: message.payloadString,
            timestamp: new Date(),
          },
        })
      );
    }
  }

  subscribe(topic: string, qos: number = 0): void {
    if (this.client && this.connected) {
      this.client.subscribe(topic, { qos });
      console.log(`Subscribed to topic: ${topic}`);
    } else {
      console.warn("MQTT not connected, cannot subscribe to:", topic);
    }
  }

  publish(topic: string, payload: string, qos: number = 0): void {
    if (this.client && this.connected) {
      const message = new Paho.Message(payload);
      message.destinationName = topic;
      message.qos = qos;

      this.client.send(message);
      console.log(`Published to ${topic}:`, payload);
    } else {
      console.warn("MQTT not connected, cannot publish to:", topic);
    }
  }

  disconnect(): void {
    if (this.client && this.connected) {
      this.client.disconnect();
      this.connected = false;
      console.log("MQTT Disconnected");
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getBrokerInfo(): MQTTConfig {
    return this.config;
  }
}

// Singleton instance
let mqttInstance: MQTTClient | null = null;

export function getMQTTClient(): MQTTClient {
  if (!mqttInstance) {
    mqttInstance = new MQTTClient();
  }
  return mqttInstance;
}
