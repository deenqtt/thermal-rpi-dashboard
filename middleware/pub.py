#!/usr/bin/env python3

import json
import time
import logging
import signal
import sys
from datetime import datetime
from pathlib import Path
import paho.mqtt.client as mqtt
from thermal_utils import ThermalInterface

class ThermalMQTTPublisher:
    def __init__(self, config_path):
        self.config_path = config_path
        self.config = self._load_config()
        self.running = False
        self.thermal = None
        self.mqtt_client = None
        self.mqtt_client_local = None # Client for localhost
        
        # Setup logging
        self._setup_logging()
        self.logger = logging.getLogger('thermal_mqtt_publisher')
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        self.logger.info("Thermal MQTT Publisher initialized")
    
    def _load_config(self):
        """Load configuration from JSON file"""
        try:
            with open(self.config_path, 'r') as f:
                config = json.load(f)
            return config
        except Exception as e:
            print(f"Error loading config: {e}")
            sys.exit(1)
    
    def _setup_logging(self):
        """Setup logging configuration"""
        log_dir = Path(__file__).parent.parent / 'logs'
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / 'thermal_mqtt.log'
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(sys.stdout)
            ]
        )
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        self.logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.stop()
    
    def _setup_mqtt(self):
        """Setup MQTT clients for both primary and local brokers"""
        try:
            # 1. --- Setup primary MQTT client (from config) ---
            self.mqtt_client = mqtt.Client()
            if self.config['mqtt'].get('username'):
                self.mqtt_client.username_pw_set(
                    self.config['mqtt']['username'],
                    self.config['mqtt'].get('password', '')
                )
            self.mqtt_client.on_connect = self._on_mqtt_connect
            self.mqtt_client.on_disconnect = self._on_mqtt_disconnect
            self.mqtt_client.connect(
                self.config['mqtt']['broker_host'],
                self.config['mqtt']['broker_port'],
                self.config['mqtt']['keepalive']
            )
            self.mqtt_client.loop_start()
            self.logger.info("Primary MQTT client setup completed")

            # 2. --- Setup secondary MQTT client (localhost) ---
            self.mqtt_client_local = mqtt.Client()
            self.mqtt_client_local.on_connect = self._on_mqtt_local_connect
            self.mqtt_client_local.on_disconnect = self._on_mqtt_local_disconnect
            self.mqtt_client_local.connect("localhost", 1883, 60)
            self.mqtt_client_local.loop_start()
            self.logger.info("Local MQTT client setup completed")
            
            return True
            
        except Exception as e:
            self.logger.error(f"MQTT setup failed: {e}")
            return False

    # --- Callbacks for Primary Client ---
    def _on_mqtt_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.logger.info("Primary MQTT connected successfully")
            self._publish_device_status("online")
        else:
            self.logger.error(f"Primary MQTT connection failed with code {rc}")
    
    def _on_mqtt_disconnect(self, client, userdata, rc):
        self.logger.warning(f"Primary MQTT disconnected with code {rc}")

    # --- Callbacks for Local Client ---
    def _on_mqtt_local_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.logger.info("Local MQTT connected successfully")
        else:
            self.logger.error(f"Local MQTT connection failed with code {rc}")

    def _on_mqtt_local_disconnect(self, client, userdata, rc):
        self.logger.warning(f"Local MQTT disconnected with code {rc}")

    def _on_mqtt_publish(self, client, userdata, mid):
        pass
    
    def _publish_device_status(self, status):
        """Publish device online/offline status to both brokers"""
        status_payload = {
            "device_id": self.config['device']['device_id'],
            "status": status,
            "timestamp": datetime.now().isoformat(),
            "interface": self.thermal.interface if self.thermal else "unknown"
        }
        payload_json = json.dumps(status_payload)
        
        # Publish to primary broker
        try:
            status_topic = f"{self.config['topic']}/status"
            self.mqtt_client.publish(
                status_topic, payload_json, qos=self.config['mqtt']['qos'], retain=True
            )
        except Exception as e:
            self.logger.error(f"Failed to publish device status to primary broker: {e}")

        # Publish to local broker
        try:
            local_status_topic = "sensors/thermal_stream/status"
            self.mqtt_client_local.publish(local_status_topic, payload_json, qos=1, retain=True)
        except Exception as e:
            self.logger.error(f"Failed to publish device status to local broker: {e}")

    def _publish_thermal_data(self, frame_data, stats):
        """Publish thermal data to both MQTT brokers"""
        try:
            payload = {
                "timestamp": datetime.now().isoformat(),
                "device_id": self.config['device']['device_id'],
                "device_name": self.config['device']['device_name'],
                "location": self.config['device']['location'],
                "interface": self.thermal.interface,
                "thermal_data": {
                    "raw_array": frame_data.tolist() if hasattr(frame_data, 'tolist') else list(frame_data),
                    "statistics": stats,
                    "frame_count": getattr(self, 'frame_count', 0)
                },
                "metadata": {
                    "sensor_type": "waveshare_thermal_camera_hat",
                    "resolution": "80x62",
                    "units": "celsius"
                }
            }
            payload_json = json.dumps(payload)
            
            # --- Publish to primary broker ---
            result_primary = self.mqtt_client.publish(
                self.config['topic'], payload_json, qos=self.config['mqtt']['qos']
            )
            
            # --- Publish to local broker ---
            result_local = self.mqtt_client_local.publish(
                "sensors/thermal_stream", payload_json, qos=1
            )
            
            if result_primary.rc == mqtt.MQTT_ERR_SUCCESS and result_local.rc == mqtt.MQTT_ERR_SUCCESS:
                self.logger.debug("Thermal data published successfully to both brokers")
                self.frame_count = getattr(self, 'frame_count', 0) + 1
            else:
                self.logger.warning(f"MQTT publish failed! Primary_rc: {result_primary.rc}, Local_rc: {result_local.rc}")
                
        except Exception as e:
            self.logger.error(f"Failed to publish thermal data: {e}")
    
    def _publish_error(self, error_msg):
        """Publish error message to both brokers"""
        error_payload = {
            "device_id": self.config['device']['device_id'],
            "timestamp": datetime.now().isoformat(),
            "error": error_msg,
            "interface": self.thermal.interface if self.thermal else "unknown"
        }
        payload_json = json.dumps(error_payload)

        # Publish to primary broker
        try:
            error_topic = f"{self.config['topic']}/error"
            self.mqtt_client.publish(error_topic, payload_json, qos=self.config['mqtt']['qos'])
        except Exception as e:
            self.logger.error(f"Failed to publish error to primary broker: {e}")
            
        # Publish to local broker
        try:
            local_error_topic = "sensors/thermal_stream/error"
            self.mqtt_client_local.publish(local_error_topic, payload_json, qos=1)
        except Exception as e:
            self.logger.error(f"Failed to publish error to local broker: {e}")

    def start(self):
        """Start the thermal MQTT publisher"""
        self.logger.info("Starting Thermal MQTT Publisher...")
        
        if not self._setup_mqtt():
            self.logger.error("Failed to setup MQTT, exiting")
            return False
        
        time.sleep(2)
        
        self.thermal = ThermalInterface(self.config)
        if not self.thermal.initialize():
            self.logger.error("Failed to initialize thermal sensor, exiting")
            return False
        
        self.logger.info(f"Thermal sensor initialized with {self.thermal.interface} interface")
        
        self.running = True
        self.frame_count = 0
        error_count = 0
        max_errors = 10
        
        try:
            while self.running:
                try:
                    frame_data = self.thermal.capture_frame()
                    if frame_data is not None:
                        stats = self.thermal.get_thermal_stats(frame_data)
                        if stats:
                            self._publish_thermal_data(frame_data, stats)
                            if self.frame_count % 60 == 0:
                                self.logger.info(
                                    f"Frame {self.frame_count}: "
                                    f"Temp range: {stats['min_temp']:.1f}°C - {stats['max_temp']:.1f}°C, "
                                    f"Avg: {stats['avg_temp']:.1f}°C, "
                                    f"Interface: {self.thermal.interface}"
                                )
                            error_count = 0
                        else:
                            raise Exception("Failed to calculate thermal statistics")
                    else:
                        raise Exception("Failed to capture thermal frame")
                    
                except Exception as e:
                    error_count += 1
                    error_msg = f"Capture error #{error_count}: {e}"
                    self.logger.error(error_msg)
                    self._publish_error(error_msg)
                    
                    if error_count >= max_errors:
                        self.logger.warning(f"Too many errors ({error_count}), restarting sensor...")
                        if self.thermal.restart_sensor():
                            self.logger.info("Sensor restarted successfully")
                            error_count = 0
                        else:
                            self.logger.error("Sensor restart failed, continuing with errors...")
                            error_count = max_errors // 2
                    
                    time.sleep(min(error_count * 2, 10))
                
                if self.running:
                    time.sleep(self.config['publishing']['interval'])
        
        except KeyboardInterrupt:
            self.logger.info("Keyboard interrupt received")
        except Exception as e:
            self.logger.error(f"Unexpected error in main loop: {e}")
        
        return True
    
    def stop(self):
        """Stop the thermal MQTT publisher"""
        self.logger.info("Stopping Thermal MQTT Publisher...")
        self.running = False
        
        if self.mqtt_client and self.mqtt_client.is_connected():
            self._publish_device_status("offline")
            time.sleep(1)
        
        if self.thermal:
            self.thermal.close()
        
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        
        if self.mqtt_client_local:
            self.mqtt_client_local.loop_stop()
            self.mqtt_client_local.disconnect()
        
        self.logger.info("Thermal MQTT Publisher stopped")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Thermal Camera MQTT Publisher')
    parser.add_argument(
        '--config', 
        default='/home/containment/thermal_mqtt_project/config/mqtt_config.json',
        help='Path to configuration file'
    )
    
    args = parser.parse_args()
    
    if not Path(args.config).exists():
        print(f"Config file not found: {args.config}")
        sys.exit(1)
    
    publisher = ThermalMQTTPublisher(args.config)
    publisher.start()

if __name__ == "__main__":
    main()