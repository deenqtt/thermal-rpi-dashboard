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
  private connecting: boolean = false;
  private subscribedTopics: Set<string> = new Set();
  private pendingSubscriptions: string[] = [];

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
      // If already connected, resolve immediately
      if (this.connected && this.client && this.client.isConnected()) {
        console.log("MQTT already connected");
        this._processPendingSubscriptions();
        resolve();
        return;
      }

      // If connecting, wait
      if (this.connecting) {
        console.log("MQTT connection in progress, waiting...");
        const checkInterval = setInterval(() => {
          if (this.connected) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.connected) {
            reject(new Error("Connection timeout"));
          }
        }, 10000);
        return;
      }

      try {
        this.connecting = true;
        this.connected = false;

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
            this.connecting = false;
            this._processPendingSubscriptions();
            resolve();
          },
          onFailure: (error) => {
            console.error("MQTT Connection failed:", error);
            this.connected = false;
            this.connecting = false;
            reject(error);
          },
          keepAliveInterval: 60,
          cleanSession: true,
          timeout: 10,
        };

        // Connect to broker
        this.client.connect(connectOptions);
      } catch (error) {
        console.error("MQTT Client creation failed:", error);
        this.connecting = false;
        this.connected = false;
        reject(error);
      }
    });
  }

  private onConnectionLost(responseObject: Paho.MQTTError) {
    if (responseObject.errorCode !== 0) {
      console.log("MQTT Connection lost:", responseObject.errorMessage);
      this.connected = false;
      this.connecting = false;

      // Move subscriptions to pending for re-subscription
      this.pendingSubscriptions = Array.from(this.subscribedTopics);
      this.subscribedTopics.clear();

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

  private _processPendingSubscriptions(): void {
    if (this.pendingSubscriptions.length > 0) {
      console.log(
        "Processing pending subscriptions:",
        this.pendingSubscriptions
      );
      const pending = [...this.pendingSubscriptions];
      this.pendingSubscriptions = [];

      pending.forEach((topic) => {
        this.subscribe(topic);
      });
    }
  }

  subscribe(topic: string, qos: number = 0): void {
    // Skip if already subscribed
    if (this.subscribedTopics.has(topic)) {
      console.log(`Already subscribed to topic: ${topic}`);
      return;
    }

    // If not connected, add to pending
    if (!this.connected || !this.client || !this.client.isConnected()) {
      console.log(`MQTT not ready, queuing subscription: ${topic}`);
      if (!this.pendingSubscriptions.includes(topic)) {
        this.pendingSubscriptions.push(topic);
      }
      return;
    }

    try {
      this.client.subscribe(topic, { qos });
      this.subscribedTopics.add(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error(`Failed to subscribe to ${topic}:`, error);
      // Add to pending for retry
      if (!this.pendingSubscriptions.includes(topic)) {
        this.pendingSubscriptions.push(topic);
      }
    }
  }

  publish(topic: string, payload: string, qos: number = 0): void {
    if (!this.connected || !this.client || !this.client.isConnected()) {
      console.warn("MQTT not connected, cannot publish to:", topic);
      return;
    }

    try {
      const message = new Paho.Message(payload);
      message.destinationName = topic;
      message.qos = qos;

      this.client.send(message);
      console.log(`Published to ${topic}:`, payload);
    } catch (error) {
      console.error(`Failed to publish to ${topic}:`, error);
    }
  }

  disconnect(): void {
    // DON'T actually disconnect - just log
    console.log(
      "MQTT disconnect called but ignored to maintain connection across pages"
    );
    // Keep the connection alive for other pages
  }

  forceDisconnect(): void {
    // Only use this when really needed (app shutdown)
    if (this.client) {
      try {
        if (this.client.isConnected()) {
          this.client.disconnect();
        }
      } catch (error) {
        console.error("Error during force disconnect:", error);
      }
    }

    this.connected = false;
    this.connecting = false;
    this.subscribedTopics.clear();
    this.pendingSubscriptions = [];
    console.log("MQTT Force disconnected");
  }

  isConnected(): boolean {
    // Double check with actual client state
    if (this.client && this.client.isConnected) {
      const actuallyConnected = this.client.isConnected();
      if (this.connected !== actuallyConnected) {
        console.log(
          `MQTT state sync: internal=${this.connected}, actual=${actuallyConnected}`
        );
        this.connected = actuallyConnected;
      }
      return actuallyConnected;
    }
    return this.connected;
  }

  isConnecting(): boolean {
    return this.connecting;
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
