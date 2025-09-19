#!/usr/bin/env python3

import json
import time
import logging
import signal
import sys
import os
import subprocess
import shutil
from datetime import datetime
from pathlib import Path
import paho.mqtt.client as mqtt

class RPiConfigManager:
    def __init__(self, config_path="/home/containment/thermal_mqtt_project/config/mqtt_config.json"):
        self.config_path = config_path
        self.config = {}
        self.running = False
        self.mqtt_client = None
        
        # MQTT Settings untuk config manager (localhost)
        self.broker_host = "localhost"
        self.broker_port = 1883
        self.device_id = "rpi_config_manager"
        
        # Topics
        self.topics = {
            "get": "rpi/config/get",
            "set": "rpi/config/set", 
            "response": "rpi/config/response",
            # Network IP Configuration Topics
            "network_get": "rpi/network/get",
            "network_set": "rpi/network/set",
            "network_response": "rpi/network/response",
            # WiFi Management Topics
            "wifi_scan": "rpi/wifi/scan",
            "wifi_scan_response": "rpi/wifi/scan_response",
            "wifi_connect": "rpi/wifi/connect",
            "wifi_connect_response": "rpi/wifi/connect_response",
            "wifi_disconnect": "rpi/wifi/disconnect",
            "wifi_disconnect_response": "rpi/wifi/disconnect_response",
            "wifi_delete": "rpi/wifi/delete",
            "wifi_delete_response": "rpi/wifi/delete_response",
            "wifi_status": "rpi/wifi/status",
            "wifi_status_get": "rpi/wifi/status/get",          # Topic baru
            "wifi_status_response": "rpi/wifi/status/response"  # Topic baru
            
        }
        
        # Network configuration - detect which system to use
        self.network_method = self._detect_network_method()
        
        # Set paths based on detected method
        if self.network_method == 'networkmanager':
            self.nm_connections_dir = "/etc/NetworkManager/system-connections"
        elif self.network_method == 'dhcpcd':
            self.dhcpcd_file = "/etc/dhcpcd.conf"
        elif self.network_method == 'interfaces':
            self.interfaces_file = "/etc/network/interfaces"
        
        # Setup logging
        self._setup_logging()
        self.logger = logging.getLogger('rpi_config_manager')
        
        # Load current config
        self.load_config()
        
        self.logger.info(f"RPi Config Manager initialized (network method: {self.network_method})")
    
    def _setup_logging(self):
        """Setup logging"""
        log_dir = Path(__file__).parent.parent / 'logs'
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / 'rpi_config_manager.log'
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(sys.stdout)
            ]
        )
    
    def load_config(self):
        """Load mqtt_config.json"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    self.config = json.load(f)
                self.logger.info("Config loaded successfully")
            else:
                self.logger.warning(f"Config file not found: {self.config_path}")
                self.config = {}
        except Exception as e:
            self.logger.error(f"Error loading config: {e}")
            self.config = {}
    
    def save_config(self):
        """Save mqtt_config.json"""
        try:
            # Backup dulu
            if os.path.exists(self.config_path):
                backup_path = f"{self.config_path}.backup.{int(time.time())}"
                shutil.copy2(self.config_path, backup_path)
                self.logger.info(f"Config backed up to: {backup_path}")
            
            # Save new config
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
            
            self.logger.info("Config saved successfully")
            return True
        except Exception as e:
            self.logger.error(f"Error saving config: {e}")
            return False
    
    # --- Network System Detection ---
    
    def _detect_network_method(self):
        """Detect which network configuration method is used"""
        try:
            # Priority 1: Check NetworkManager (default on RPi5 Bookworm)
            result = subprocess.run(['systemctl', 'is-active', 'NetworkManager'], 
                                   capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip() == 'active':
                return 'networkmanager'
            
            # Priority 2: Check dhcpcd (older RPi OS)
            if os.path.exists('/etc/dhcpcd.conf'):
                result = subprocess.run(['systemctl', 'is-active', 'dhcpcd'], 
                                       capture_output=True, text=True)
                if result.returncode == 0 and result.stdout.strip() == 'active':
                    return 'dhcpcd'
            
            # Priority 3: Check systemd-networkd
            result = subprocess.run(['systemctl', 'is-active', 'systemd-networkd'], 
                                   capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip() == 'active':
                return 'systemd-networkd'
            
            # Priority 4: Check interfaces file (legacy)
            if os.path.exists('/etc/network/interfaces'):
                with open('/etc/network/interfaces', 'r') as f:
                    content = f.read().strip()
                    if content and not all(line.startswith('#') for line in content.splitlines() if line.strip()):
                        return 'interfaces'
            
            # Default fallback
            return 'networkmanager'
            
        except Exception as e:
            self.logger.error(f"Error detecting network method: {e}")
            return 'networkmanager'
    
    # --- NetworkManager Functions ---
    
    def _get_ethernet_connection_name(self, interface="eth0"):
        """Get actual ethernet connection name from NetworkManager"""
        try:
            result = subprocess.run([
                'nmcli', '-t', '-f', 'NAME,TYPE,DEVICE', 'connection', 'show'
            ], capture_output=True, text=True, check=True)
            
            self.logger.info(f"Connection list output: {result.stdout}")
            
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split(':')
                    if len(parts) >= 3:
                        name, conn_type, device = parts[:3]
                        if conn_type == 'ethernet' and device == interface:
                            self.logger.info(f"Found ethernet connection: '{name}' on {interface}")
                            return name
            
            # Fallback: look for any ethernet connection  
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split(':')
                    if len(parts) >= 2 and parts[1] == 'ethernet':
                        self.logger.info(f"Found ethernet connection: '{parts[0]}' (fallback)")
                        return parts[0]
            
            # Default fallback
            self.logger.info("Using default ethernet connection name")
            return "Wired connection 1"
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Error getting ethernet connection name: {e}")
            return "Wired connection 1"
        except Exception as e:
            self.logger.error(f"Unexpected error getting connection name: {e}")
            return "Wired connection 1"
    
    def _validate_network_config(self, static_ip, netmask, gateway=None):
        """Validate network configuration"""
        try:
            import ipaddress
            
            # Validate IP address
            ip_obj = ipaddress.IPv4Address(static_ip)
            
            # Validate netmask and get CIDR
            cidr = self._netmask_to_cidr(netmask)
            network = ipaddress.IPv4Network(f"{static_ip}/{cidr}", strict=False)
            
            # Validate gateway is in same network (if provided)
            if gateway:
                gateway_obj = ipaddress.IPv4Address(gateway)
                if gateway_obj not in network:
                    raise ValueError(f"Gateway {gateway} not in network {network}")
            
            return True, f"Valid network configuration: {network}"
            
        except Exception as e:
            return False, f"Invalid network config: {e}"
    
    def _netmask_to_cidr(self, netmask):
        """Convert netmask to CIDR notation with validation"""
        try:
            octets = netmask.split('.')
            if len(octets) != 4:
                raise ValueError(f"Invalid netmask format: {netmask}")
            
            cidr = 0
            for octet in octets:
                octet_int = int(octet)
                if not 0 <= octet_int <= 255:
                    raise ValueError(f"Invalid octet value: {octet_int}")
                cidr += bin(octet_int).count('1')
            
            if not 8 <= cidr <= 30:
                raise ValueError(f"Invalid CIDR: /{cidr}")
                
            return cidr
        except Exception as e:
            self.logger.error(f"Netmask conversion error: {e}")
            raise ValueError(f"Invalid netmask: {netmask}")
    
    def _cidr_to_netmask(self, cidr):
        """Convert CIDR to netmask"""
        try:
            mask = (0xffffffff >> (32 - cidr)) << (32 - cidr)
            return f"{(mask >> 24) & 0xff}.{(mask >> 16) & 0xff}.{(mask >> 8) & 0xff}.{mask & 0xff}"
        except:
            return "255.255.255.0"
    
    def _set_networkmanager_static(self, interface, ip, netmask, gateway, dns):
        """Set static IP using NetworkManager"""
        try:
            # Validate network configuration first
            valid, msg = self._validate_network_config(ip, netmask, gateway)
            if not valid:
                return False, msg
            
            # Get actual connection name
            conn_name = self._get_ethernet_connection_name(interface)
            self.logger.info(f"Using connection name: '{conn_name}'")
            
            # Configure static IP on existing connection
            cidr = self._netmask_to_cidr(netmask)
            
            cmd = [
                'nmcli', 'con', 'modify', conn_name,
                'ipv4.method', 'manual',
                'ipv4.addresses', f'{ip}/{cidr}',
                'ipv4.gateway', gateway
            ]
            
            if dns:
                cmd.extend(['ipv4.dns', dns.replace(' ', ',')])
            
            self.logger.info(f"Executing command: {cmd}")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            self.logger.info(f"Static IP configured for connection: '{conn_name}'")
            
            # Try to reactivate connection
            try:
                down_cmd = ['nmcli', 'con', 'down', conn_name]
                up_cmd = ['nmcli', 'con', 'up', conn_name]
                
                self.logger.info(f"Deactivating connection: {down_cmd}")
                subprocess.run(down_cmd, capture_output=True, text=True, check=True)
                time.sleep(2)
                
                self.logger.info(f"Activating connection: {up_cmd}")
                subprocess.run(up_cmd, capture_output=True, text=True, check=True)
                
                self.logger.info("Connection reactivated successfully")
                return True, f"Static IP {ip} set and activated for {interface}"
            except subprocess.CalledProcessError as e:
                self.logger.info(f"Connection configured but activation failed: {e.stderr}")
                return True, f"Static IP {ip} configured for {interface}. Connect ethernet cable to activate."
            
        except subprocess.CalledProcessError as e:
            error_msg = f"nmcli command failed: {e.stderr if e.stderr else str(e)}"
            self.logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Error setting NetworkManager static IP: {e}"
            self.logger.error(error_msg)
            return False, error_msg
    
    def _set_networkmanager_dhcp(self, interface):
        """Set DHCP using NetworkManager"""
        try:
            conn_name = self._get_ethernet_connection_name(interface)
            self.logger.info(f"Using connection name: '{conn_name}'")
            
            cmd = [
                'nmcli', 'con', 'modify', conn_name,
                'ipv4.method', 'auto'
            ]
            
            # Clear any static settings
            clear_cmds = [
                ['nmcli', 'con', 'modify', conn_name, 'ipv4.addresses', ''],
                ['nmcli', 'con', 'modify', conn_name, 'ipv4.gateway', ''],
                ['nmcli', 'con', 'modify', conn_name, 'ipv4.dns', '']
            ]
            
            for clear_cmd in clear_cmds:
                subprocess.run(clear_cmd, capture_output=True, text=True)
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            self.logger.info(f"DHCP configured for connection: '{conn_name}'")
            
            # Try to reactivate connection
            try:
                down_cmd = ['nmcli', 'con', 'down', conn_name]
                up_cmd = ['nmcli', 'con', 'up', conn_name]
                
                subprocess.run(down_cmd, capture_output=True, text=True, check=True)
                time.sleep(2)
                subprocess.run(up_cmd, capture_output=True, text=True, check=True)
                
                self.logger.info("DHCP connection activated successfully")
                return True, f"DHCP configured and activated for {interface}"
            except subprocess.CalledProcessError:
                self.logger.info("DHCP configured but activation failed (cable may not be connected)")
                return True, f"DHCP configured for {interface}. Connect ethernet cable to activate."
                
        except subprocess.CalledProcessError as e:
            error_msg = f"nmcli command failed: {e.stderr if e.stderr else str(e)}"
            self.logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            return False, f"Error setting NetworkManager DHCP: {e}"
    
    # --- Network Configuration Functions ---
    
    def read_current_ip_config(self):
        """Read current IP configuration based on detected network method"""
        try:
            if self.network_method == 'networkmanager':
                return self._read_networkmanager_config()
            elif self.network_method == 'dhcpcd':
                return self._read_dhcpcd_config()
            elif self.network_method == 'interfaces':
                return self._read_interfaces_config()
            else:
                return False, f"Unsupported network method: {self.network_method}"
                
        except Exception as e:
            self.logger.error(f"Error reading network config: {e}")
            return False, f"Error reading network config: {e}"
    
    def _read_networkmanager_config(self):
        """Read NetworkManager configuration"""
        try:
            # Get device status
            result = subprocess.run(['nmcli', '-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status'], 
                                   capture_output=True, text=True, check=True)
            
            self.logger.info(f"Device status output: {result.stdout}")
            
            interfaces = {}
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split(':')
                    if len(parts) >= 4:
                        device, type_name, state, connection = parts[:4]
                        if type_name in ['ethernet', 'wifi']:
                            interfaces[device] = {
                                'state': state,
                                'connection': connection if connection else 'none',
                                'type': type_name,
                                'method': 'dhcp'  # Default
                            }
                            
                            self.logger.info(f"Processing device {device}: state={state}, connection='{connection}'")
                            
                            # If ethernet has no active connection, try to find configured connection
                            if device == 'eth0' and (not connection or connection == '--'):
                                self.logger.info("eth0 has no active connection, looking for ethernet connections...")
                                try:
                                    # Find ethernet connections
                                    conn_result = subprocess.run([
                                        'nmcli', '-t', '-f', 'NAME,TYPE', 'con', 'show'
                                    ], capture_output=True, text=True, check=True)
                                    
                                    for conn_line in conn_result.stdout.strip().split('\n'):
                                        if conn_line:
                                            conn_parts = conn_line.split(':')
                                            if len(conn_parts) >= 2 and conn_parts[1] == 'ethernet':
                                                connection = conn_parts[0]
                                                interfaces[device]['connection'] = connection
                                                self.logger.info(f"Found ethernet connection: '{connection}'")
                                                break
                                except subprocess.CalledProcessError as e:
                                    self.logger.error(f"Failed to find ethernet connections: {e}")
                            
                            # Get detailed connection info if connection exists
                            if connection and connection != '--' and connection != '':
                                try:
                                    # Get connection details
                                    con_result = subprocess.run([
                                        'nmcli', '-t', '-f', 'ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns', 
                                        'con', 'show', connection
                                    ], capture_output=True, text=True, check=True)
                                    
                                    self.logger.info(f"Connection '{connection}' details: {con_result.stdout}")
                                    
                                    for con_line in con_result.stdout.strip().split('\n'):
                                        if ':' in con_line:
                                            key, value = con_line.split(':', 1)
                                            if key == 'ipv4.method':
                                                interfaces[device]['method'] = 'static' if value == 'manual' else 'dhcp'
                                                self.logger.info(f"Device {device} method: {interfaces[device]['method']}")
                                            elif key == 'ipv4.addresses' and value:
                                                addr = value.split(',')[0]  # Take first address
                                                if '/' in addr:
                                                    ip_addr = addr.split('/')[0]
                                                    cidr = addr.split('/')[1]
                                                    interfaces[device]['address'] = ip_addr
                                                    interfaces[device]['cidr'] = cidr
                                                    interfaces[device]['netmask'] = self._cidr_to_netmask(int(cidr))
                                                    self.logger.info(f"Device {device} configured IP: {ip_addr}/{cidr}")
                                            elif key == 'ipv4.gateway' and value:
                                                interfaces[device]['gateway'] = value
                                                self.logger.info(f"Device {device} gateway: {value}")
                                            elif key == 'ipv4.dns' and value:
                                                interfaces[device]['dns-nameservers'] = value.replace(';', ' ')
                                                self.logger.info(f"Device {device} DNS: {interfaces[device]['dns-nameservers']}")
                                except subprocess.CalledProcessError as e:
                                    self.logger.error(f"Failed to get connection details for '{connection}': {e}")
                            
                            # Get current active IP if connected
                            if state == 'connected':
                                try:
                                    ip_result = subprocess.run(['nmcli', '-t', '-f', 'IP4.ADDRESS', 'device', 'show', device],
                                                             capture_output=True, text=True, check=True)
                                    
                                    if ip_result.stdout.strip():
                                        for ip_line in ip_result.stdout.strip().split('\n'):
                                            if ip_line.startswith('IP4.ADDRESS[1]'):
                                                ip_addr_full = ip_line.split(':')[1].strip()
                                                if '/' in ip_addr_full:
                                                    interfaces[device]['current_address'] = ip_addr_full.split('/')[0]
                                                    self.logger.info(f"Device {device} current IP: {interfaces[device]['current_address']}")
                                                break
                                except subprocess.CalledProcessError as e:
                                    self.logger.error(f"Failed to get current IP for {device}: {e}")
            
            self.logger.info(f"Final interfaces config: {interfaces}")
            return True, interfaces
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"NetworkManager command failed: {e}")
            return False, f"NetworkManager command failed: {e}"
        except Exception as e:
            self.logger.error(f"Error reading NetworkManager config: {e}")
            return False, f"Error reading NetworkManager config: {e}"
    
    def _read_dhcpcd_config(self):
        """Read dhcpcd configuration"""
        try:
            interfaces = {}
            
            if os.path.exists(self.dhcpcd_file):
                with open(self.dhcpcd_file, 'r') as f:
                    content = f.read()
                
                current_interface = None
                for line in content.splitlines():
                    line = line.strip()
                    if line.startswith('interface '):
                        current_interface = line.split()[1]
                        interfaces[current_interface] = {'method': 'static'}
                    elif current_interface and line.startswith('static ip_address='):
                        interfaces[current_interface]['address'] = line.split('=')[1].split('/')[0]
                    elif current_interface and line.startswith('static routers='):
                        interfaces[current_interface]['gateway'] = line.split('=')[1]
                    elif current_interface and line.startswith('static domain_name_servers='):
                        interfaces[current_interface]['dns-nameservers'] = line.split('=')[1]
            
            # Add common interfaces if not found
            for iface in ['eth0', 'wlan0']:
                if iface not in interfaces:
                    interfaces[iface] = {'method': 'dhcp'}
            
            return True, interfaces
            
        except Exception as e:
            return False, f"Error reading dhcpcd config: {e}"
    
    def _read_interfaces_config(self):
        """Read /etc/network/interfaces configuration"""
        try:
            if not os.path.exists('/etc/network/interfaces'):
                return True, {'eth0': {'method': 'dhcp'}, 'wlan0': {'method': 'dhcp'}}
                
            with open('/etc/network/interfaces', 'r') as file:
                file_content = file.read()
            interfaces_json = self.parse_interfaces_file(file_content)
            return True, interfaces_json
            
        except FileNotFoundError:
            return True, {'eth0': {'method': 'dhcp'}, 'wlan0': {'method': 'dhcp'}}
        except PermissionError:
            return False, f"Permission denied to read /etc/network/interfaces"
        except Exception as e:
            return False, f"Error reading interfaces file: {e}"
    
    def parse_interfaces_file(self, content):
        """Parse /etc/network/interfaces file content"""
        interfaces = {}
        current_iface = None
        try:
            for line in content.splitlines():
                line = line.strip()

                if line.startswith("auto "):
                    current_iface = line.split()[1]
                    if current_iface not in interfaces:
                        interfaces[current_iface] = {}

                elif line.startswith("iface "):
                    parts = line.split()
                    if len(parts) < 4:
                        continue
                    
                    iface_name = parts[1]
                    if iface_name not in interfaces:
                        interfaces[iface_name] = {}
                    interfaces[iface_name]["method"] = parts[3]
                    current_iface = iface_name

                elif current_iface and line:
                    try:
                        key, value = line.split(maxsplit=1)
                        if key in ["address", "netmask", "gateway", "dns-nameservers"]:
                            interfaces[current_iface][key] = value
                    except ValueError:
                        pass
                        
            return interfaces
        except Exception as e:
            self.logger.error(f"Error parsing interfaces file: {e}")
            return {}

    def set_static_ip(self, interface="eth0", ip="192.168.0.100", netmask="255.255.255.0", gateway="192.168.0.1", dns="8.8.8.8 8.8.4.4"):
        """Set static IP for interface using detected network method"""
        try:
            if self.network_method == 'networkmanager':
                return self._set_networkmanager_static(interface, ip, netmask, gateway, dns)
            elif self.network_method == 'dhcpcd':
                return self._set_dhcpcd_static(interface, ip, netmask, gateway, dns)
            elif self.network_method == 'interfaces':
                return self._set_interfaces_static(interface, ip, netmask, gateway, dns)
            else:
                return False, f"Unsupported network method: {self.network_method}"
                
        except Exception as e:
            self.logger.error(f"Error setting static IP: {e}")
            return False, f"Error setting static IP: {e}"

    def set_dynamic_ip(self, interface="eth0"):
        """Set dynamic IP (DHCP) for interface using detected network method"""
        try:
            if self.network_method == 'networkmanager':
                return self._set_networkmanager_dhcp(interface)
            elif self.network_method == 'dhcpcd':
                return self._set_dhcpcd_dhcp(interface)
            elif self.network_method == 'interfaces':
                return self._set_interfaces_dhcp(interface)
            else:
                return False, f"Unsupported network method: {self.network_method}"
                
        except Exception as e:
            self.logger.error(f"Error setting dynamic IP: {e}")
            return False, f"Error setting dynamic IP: {e}"
    
    # --- dhcpcd Methods ---
    
    def _set_dhcpcd_static(self, interface, ip, netmask, gateway, dns):
        """Set static IP using dhcpcd"""
        try:
            if not os.path.exists(self.dhcpcd_file):
                return False, f"dhcpcd.conf not found at {self.dhcpcd_file}"
            
            valid, msg = self._validate_network_config(ip, netmask, gateway)
            if not valid:
                return False, msg
            
            with open(self.dhcpcd_file, 'r') as f:
                config_lines = f.readlines()
            
            # Remove existing interface config
            new_lines = []
            skip_interface = False
            for line in config_lines:
                if line.strip().startswith(f'interface {interface}'):
                    skip_interface = True
                    continue
                elif line.strip().startswith('interface ') and skip_interface:
                    skip_interface = False
                    new_lines.append(line)
                elif not skip_interface:
                    new_lines.append(line)
            
            # Add new static config
            new_lines.append(f'\n# Static IP for {interface}\n')
            new_lines.append(f'interface {interface}\n')
            new_lines.append(f'static ip_address={ip}/{self._netmask_to_cidr(netmask)}\n')
            new_lines.append(f'static routers={gateway}\n')
            if dns:
                new_lines.append(f'static domain_name_servers={dns}\n')
            
            with open(self.dhcpcd_file, 'w') as f:
                f.writelines(new_lines)
            
            subprocess.run(['sudo', 'systemctl', 'restart', 'dhcpcd'], 
                          check=True, capture_output=True)
            
            self.logger.info(f"dhcpcd static IP set for {interface}: {ip}")
            return True, f"Static IP {ip} set successfully using dhcpcd"
            
        except Exception as e:
            return False, f"Error setting dhcpcd static IP: {e}"
    
    def _set_dhcpcd_dhcp(self, interface):
        """Set DHCP using dhcpcd"""
        try:
            if not os.path.exists(self.dhcpcd_file):
                return False, f"dhcpcd.conf not found at {self.dhcpcd_file}"
            
            with open(self.dhcpcd_file, 'r') as f:
                config_lines = f.readlines()
            
            # Remove existing interface config
            new_lines = []
            skip_interface = False
            for line in config_lines:
                if line.strip().startswith(f'interface {interface}'):
                    skip_interface = True
                    continue
                elif line.strip().startswith('interface ') and skip_interface:
                    skip_interface = False
                    new_lines.append(line)
                elif not skip_interface:
                    new_lines.append(line)
            
            with open(self.dhcpcd_file, 'w') as f:
                f.writelines(new_lines)
            
            subprocess.run(['sudo', 'systemctl', 'restart', 'dhcpcd'], 
                          check=True, capture_output=True)
            
            self.logger.info(f"dhcpcd DHCP set for {interface}")
            return True, f"DHCP set successfully for {interface} using dhcpcd"
            
        except Exception as e:
            return False, f"Error setting dhcpcd DHCP: {e}"
    
    # --- interfaces Methods ---
    
    def _set_interfaces_static(self, interface, ip, netmask, gateway, dns):
        """Set static IP using /etc/network/interfaces"""
        try:
            if not os.path.exists('/etc/network/interfaces'):
                return False, "/etc/network/interfaces not found"
            
            valid, msg = self._validate_network_config(ip, netmask, gateway)
            if not valid:
                return False, msg
            
            success, message = self.change_ip_configuration(interface, "static", ip, netmask, gateway, dns)
            if success:
                self.logger.info(f"Static IP set for {interface}: {ip}")
                restart_success, restart_msg = self.restart_networking_service()
                return restart_success, f"{message} {restart_msg}"
            return success, message
            
        except Exception as e:
            return False, f"Error setting interfaces static IP: {e}"
    
    def _set_interfaces_dhcp(self, interface):
        """Set DHCP using /etc/network/interfaces"""
        try:
            if not os.path.exists('/etc/network/interfaces'):
                return False, "/etc/network/interfaces not found"
            
            success, message = self.change_ip_configuration(interface, "dhcp")
            if success:
                self.logger.info(f"Dynamic IP set for {interface}")
                restart_success, restart_msg = self.restart_networking_service()
                return restart_success, f"{message} {restart_msg}"
            return success, message
            
        except Exception as e:
            return False, f"Error setting interfaces DHCP: {e}"
    
    def change_ip_configuration(self, interface, method, static_ip=None, netmask=None, gateway=None, dns=None):
        """Changes IP configuration in /etc/network/interfaces"""
        try:
            interfaces_file = '/etc/network/interfaces'
            
            if not os.access(interfaces_file, os.W_OK):
                return False, f"No write permission to {interfaces_file}. Run with sudo."
            
            backup_file = f"{interfaces_file}.backup.{int(time.time())}"
            shutil.copy2(interfaces_file, backup_file)
            
            with open(interfaces_file, 'r') as file:
                lines = file.readlines()

            new_lines = []
            in_target_iface_section = False
            
            for line in lines:
                stripped_line = line.strip()

                if stripped_line.startswith(f"auto {interface}"):
                    new_lines.append(line)

                elif stripped_line.startswith(f"iface {interface}"):
                    in_target_iface_section = True
                    new_lines.append(f"iface {interface} inet {method}\n")
                    
                    if method == "static":
                        if not all([static_ip, netmask, gateway]):
                            return False, "Missing static IP parameters (address, netmask, gateway)."
                        new_lines.append(f"\taddress {static_ip}\n")
                        new_lines.append(f"\tnetmask {netmask}\n")
                        new_lines.append(f"\tgateway {gateway}\n")
                        if dns:
                            new_lines.append(f"\tdns-nameservers {dns}\n")
                
                elif in_target_iface_section and (
                    stripped_line.startswith("address ") or 
                    stripped_line.startswith("netmask ") or 
                    stripped_line.startswith("gateway ") or
                    stripped_line.startswith("dns-nameservers ") or
                    stripped_line.startswith("pre-up ") or
                    stripped_line.startswith("post-down ") or
                    stripped_line.startswith("iface ")
                ):
                    if stripped_line.startswith("iface ") and stripped_line != f"iface {interface} inet {method}":
                        in_target_iface_section = False
                        new_lines.append(line)
                elif not in_target_iface_section:
                    new_lines.append(line)
            
            with open(interfaces_file, 'w') as file:
                file.writelines(new_lines)

            return True, "IP configuration updated successfully."
            
        except Exception as e:
            self.logger.error(f"Error updating IP configuration: {e}")
            return False, str(e)

    def restart_networking_service(self):
        """Restarts the appropriate networking service based on detected method"""
        try:
            if self.network_method == 'networkmanager':
                subprocess.run(["sudo", "systemctl", "restart", "NetworkManager"], 
                              check=True, text=True, capture_output=True)
                self.logger.info("NetworkManager service restarted successfully")
                return True, "NetworkManager service restarted successfully."
                
            elif self.network_method == 'dhcpcd':
                subprocess.run(["sudo", "systemctl", "restart", "dhcpcd"], 
                              check=True, text=True, capture_output=True)
                self.logger.info("dhcpcd service restarted successfully")
                return True, "dhcpcd service restarted successfully."
                
            elif self.network_method == 'interfaces':
                try:
                    subprocess.run(["sudo", "systemctl", "restart", "networking"], 
                                  check=True, text=True, capture_output=True)
                    self.logger.info("networking service restarted successfully")
                    return True, "networking service restarted successfully."
                except subprocess.CalledProcessError:
                    self.logger.info("networking service not found, using ifdown/ifup")
                    subprocess.run(["sudo", "ifdown", "eth0"], capture_output=True)
                    time.sleep(2)
                    subprocess.run(["sudo", "ifup", "eth0"], capture_output=True)
                    return True, "Network interface restarted with ifdown/ifup."
            else:
                return False, f"Unknown network method: {self.network_method}"
                
        except subprocess.CalledProcessError as e:
            error_msg = f"Failed to restart network service: {e.stderr.strip() if e.stderr else str(e)}"
            self.logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error restarting network service: {e}"
            self.logger.error(error_msg)
            return False, error_msg
    
    # --- WiFi Management Functions ---
    
    def run_nmcli_command(self, command_args, description):
        """Helper to run nmcli commands and handle output/errors"""
        try:
            result = subprocess.run(['nmcli'] + command_args, stdout=subprocess.PIPE, 
                                   stderr=subprocess.PIPE, text=True, check=True, timeout=15)
            return True, result.stdout.strip()
        except subprocess.CalledProcessError as e:
            error_msg = f"Failed to {description}: {e.stderr.strip()}"
            self.logger.error(error_msg)
            return False, error_msg
        except FileNotFoundError:
            error_msg = "nmcli command not found. NetworkManager might not be installed."
            self.logger.error(error_msg)
            return False, error_msg
        except subprocess.TimeoutExpired:
            error_msg = f"Command timed out while trying to {description}."
            self.logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error while trying to {description}: {e}"
            self.logger.error(error_msg)
            return False, error_msg

    def scan_wifi(self):
        """Scans for available Wi-Fi networks"""
        self.logger.info("Scanning for Wi-Fi networks...")
        # Get current connection info for comparison
        current_status = self.get_wifi_status()
        current_ssid = None
        if current_status.get("connected") and current_status.get("current_network"):
            current_ssid = current_status["current_network"]["ssid"]
        success, filtered_output = self.run_nmcli_command(['-t', '-f', 'SSID,SECURITY,SIGNAL,FREQ', 'dev', 'wifi', 'list', '--rescan', 'yes'], 
                                                 "scan Wi-Fi networks")
        if not success:
            return []
        
        wifi_networks = []
        seen_ssids = set()

        for filtered_line in filtered_output.splitlines():
            parts = filtered_line.split(':', 3)
            if len(parts) >= 4:
                ssid = parts[0].strip()
                security = parts[1].strip()
                signal = parts[2].strip()
                frequency = parts[3].strip()
                
                if ssid and ssid not in seen_ssids:
                    seen_ssids.add(ssid)
                    
                    network_info = {
                        "ssid": ssid, 
                        "security": security,
                        "signal": signal,
                        "frequency": frequency,
                        "is_current": ssid == current_ssid,
                        "is_saved": any(saved["ssid"] == ssid for saved in current_status.get("saved_networks", []))
                    }
                    
                    wifi_networks.append(network_info)

        # Sort by signal strength (descending)
        wifi_networks.sort(key=lambda x: int(x["signal"]) if x["signal"].isdigit() else 0, reverse=True)
        
        self.logger.info(f"Found {len(wifi_networks)} Wi-Fi networks.")
        return wifi_networks

    def disconnect_current_wifi(self):
        """Disconnects any active Wi-Fi connection on wlan0"""
        self.logger.info("Attempting to disconnect current Wi-Fi connection on wlan0...")
        success, message = self.run_nmcli_command(['device', 'disconnect', 'wlan0'], "disconnect current Wi-Fi")
        
        if not success and "not connected" not in message.lower():
            self.logger.warning(f"Failed to disconnect Wi-Fi: {message}")
            return False, message
        
        self.logger.info("Successfully disconnected Wi-Fi.")
        return True, "Successfully disconnected."

    def connect_wifi(self, ssid, password=None):
        """Connects to a Wi-Fi network"""
        self.logger.info(f"Attempting to connect to Wi-Fi SSID: {ssid}")

        disconnect_success, disconnect_msg = self.disconnect_current_wifi()
        if not disconnect_success and "not connected" not in disconnect_msg.lower():
            return False, disconnect_msg

        time.sleep(2)

        if password:
            connect_success, connect_msg = self.run_nmcli_command(['dev', 'wifi', 'connect', ssid, 'password', password], 
                                                                 f"connect to {ssid}")
        else:
            connect_success, connect_msg = self.run_nmcli_command(['dev', 'wifi', 'connect', ssid], 
                                                                 f"connect to {ssid} (no password)")
        
        if not connect_success:
            return False, connect_msg

        self.logger.info(f"Successfully connected to {ssid}")
        time.sleep(3)

        ip_success, ip_output = self.run_nmcli_command(['device', 'show', 'wlan0'], "get IP address from wlan0")
        if ip_success:
            import re
            match = re.search(r"IP4\.ADDRESS\[1\]:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/\d+", ip_output)
            ip_address = match.group(1) if match else "IP not found"
        else:
            ip_address = "IP not found"

        return True, ip_address

    def delete_wifi(self, ssid):
        """Deletes a Wi-Fi connection by SSID"""
        self.logger.info(f"Attempting to delete Wi-Fi connection: {ssid}")
        
        success, output = self.run_nmcli_command(['-t', '-f', 'UUID,NAME', 'connection', 'show'], 
                                                "fetch Wi-Fi connections")
        if not success:
            return False, output

        uuid_to_delete = None
        for line in output.splitlines():
            parts = line.split(':')
            if len(parts) >= 2 and parts[1] == ssid:
                uuid_to_delete = parts[0]
                break

        if not uuid_to_delete:
            return False, f"Wi-Fi connection '{ssid}' not found in saved connections."

        success, message = self.run_nmcli_command(['connection', 'delete', 'uuid', uuid_to_delete], 
                                                 f"delete Wi-Fi connection '{ssid}'")
        if not success:
            return False, message
        
        self.logger.info(f"Successfully deleted Wi-Fi {ssid}")
        return True, f"Wi-Fi {ssid} deleted successfully."

    def get_wifi_status(self):
        """Get comprehensive WiFi status including current connection and saved networks"""
        try:
            # Get current connection status
            success, output = self.run_nmcli_command(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status'], 
                                                    "get device status")
            if not success:
                return {"connected": False, "current_network": None, "saved_networks": [], "error": output}

            wifi_status = {
                "connected": False, 
                "current_network": None,
                "saved_networks": [],
                "device_state": "unknown"
            }
            
            # Check WiFi device status
            for line in output.splitlines():
                parts = line.split(':')
                if len(parts) >= 4 and parts[0] == 'wlan0':
                    wifi_status["device_state"] = parts[2]
                    
                    if parts[2] == 'connected' and parts[3]:
                        wifi_status["connected"] = True
                        connection_name = parts[3]  # Simpan connection name
                        
                        # Get SSID asli dari connection profile
                        ssid_success, ssid_output = self.run_nmcli_command(['-t', '-f', '802-11-wireless.ssid', 'connection', 'show', connection_name], 
                                                                        "get real SSID")
                        current_ssid = connection_name  # fallback
                        if ssid_success and ssid_output.strip():
                            for line in ssid_output.splitlines():
                                if line.startswith('802-11-wireless.ssid:'):
                                    current_ssid = line.split(':', 1)[1].strip()
                                    break
                        
                        # Get detailed info for current connection
                        ip_success, ip_output = self.run_nmcli_command(['device', 'show', 'wlan0'], "get wlan0 details")
                        current_ip = None
                        signal_strength = None
                        
                        if ip_success:
                            import re
                            # Extract IP address
                            ip_match = re.search(r"IP4\.ADDRESS\[1\]:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/\d+", ip_output)
                            if ip_match:
                                current_ip = ip_match.group(1)
                        
                        # Get signal strength for current connection
                        signal_success, signal_output = self.run_nmcli_command(['-t', '-f', 'SSID,SIGNAL', 'dev', 'wifi'], 
                                                                            "get current signal strength")
                        if signal_success:
                            for signal_line in signal_output.splitlines():
                                signal_parts = signal_line.split(':')
                                if len(signal_parts) >= 2 and signal_parts[0] == current_ssid:
                                    signal_strength = signal_parts[1]
                                    break
                        
                        wifi_status["current_network"] = {
                            "ssid": current_ssid,
                            "ip_address": current_ip,
                            "signal_strength": signal_strength
                        }
                    break
            
            # Get all saved WiFi connections
            saved_success, saved_output = self.run_nmcli_command(['-t', '-f', 'NAME,TYPE', 'connection', 'show'], 
                                                                "get saved connections")
            if saved_success:
                for line in saved_output.splitlines():
                    parts = line.split(':')
                    if len(parts) >= 2 and parts[1] == '802-11-wireless':
                        wifi_status["saved_networks"].append({
                            "ssid": parts[0],
                            "is_current": wifi_status["connected"] and wifi_status["current_network"] and 
                                        wifi_status["current_network"]["ssid"] == parts[0]
                        })
            
            return wifi_status
            
        except Exception as e:
            self.logger.error(f"Error getting comprehensive WiFi status: {e}")
            return {"connected": False, "current_network": None, "saved_networks": [], "error": str(e)}
    
    # --- MQTT Setup and Handlers ---
    
    def setup_mqtt(self):
        """Setup MQTT client"""
        try:
            self.mqtt_client = mqtt.Client(client_id=self.device_id)
            self.mqtt_client.on_connect = self._on_connect
            self.mqtt_client.on_message = self._on_message
            
            self.mqtt_client.connect(self.broker_host, self.broker_port, 60)
            self.mqtt_client.loop_start()
            
            self.logger.info("MQTT connected to localhost")
            return True
            
        except Exception as e:
            self.logger.error(f"MQTT setup failed: {e}")
            return False
    
    def _on_connect(self, client, userdata, flags, rc):
        """MQTT connected"""
        if rc == 0:
            self.logger.info("MQTT connected successfully")
            
            topics_to_subscribe = [
                "get", "set", "network_get", "network_set", 
                "wifi_scan", "wifi_connect", "wifi_disconnect", "wifi_delete",
                "wifi_status_get"  # Tambah topic baru
            ]

            for topic_key in topics_to_subscribe:
                client.subscribe(self.topics[topic_key])
            
            self.logger.info("Subscribed to all configuration topics")
            
        else:
            self.logger.error(f"MQTT connection failed: {rc}")
    
    def _on_message(self, client, userdata, msg):
        """Handle MQTT messages"""
        try:
            topic = msg.topic
            payload_str = msg.payload.decode('utf-8')
            
            self.logger.info(f"Received: {topic} -> {payload_str}")
            
            if topic == self.topics["get"]:
                self._handle_get_config()
            elif topic == self.topics["set"]:
                self._handle_set_config(payload_str)
            elif topic == self.topics["network_get"]:
                self._handle_get_network_config()
            elif topic == self.topics["network_set"]:
                self._handle_set_network_config(payload_str)
            elif topic == self.topics["wifi_scan"]:
                self._handle_wifi_scan()
            elif topic == self.topics["wifi_connect"]:
                self._handle_wifi_connect(payload_str)
            elif topic == self.topics["wifi_disconnect"]:
                self._handle_wifi_disconnect()
            elif topic == self.topics["wifi_delete"]:
                self._handle_wifi_delete(payload_str)
            elif topic == self.topics["wifi_status_get"]:  # Handler baru
                self._handle_wifi_status_get()
                
        except Exception as e:
            self.logger.error(f"Error handling message: {e}")
            self._publish_response("error", {"error": str(e)})
    
    def _handle_get_config(self):
        """Handle get config request"""
        try:
            self.load_config()
            
            response_data = {
                "action": "get_config",
                "status": "success",
                "timestamp": datetime.now().isoformat(),
                "config": self.config
            }
            
            self._publish_response("success", response_data)
            self.logger.info("Config sent successfully")
            
        except Exception as e:
            self.logger.error(f"Error getting config: {e}")
            self._publish_response("error", {"error": str(e)})
    
    def _handle_set_config(self, payload_str):
        """Handle set config request"""
        try:
            payload = json.loads(payload_str)
            
            if "config" not in payload:
                raise ValueError("Missing 'config' field")
            
            new_config = payload["config"]
            old_config = self.config.copy()
            
            self.config = new_config
            
            if self.save_config():
                response_data = {
                    "action": "set_config",
                    "status": "success",
                    "timestamp": datetime.now().isoformat(),
                    "message": "Config updated successfully"
                }
                
                thermal_changed = (
                    old_config.get("mqtt", {}) != new_config.get("mqtt", {}) or
                    old_config.get("thermal", {}) != new_config.get("thermal", {})
                )
                
                if thermal_changed:
                    response_data["restart_required"] = True
                    response_data["message"] += " - Restarting thermal service..."
                    self._restart_thermal_service()
                
                self._publish_response("success", response_data)
                self.logger.info("Config updated successfully")
                
            else:
                raise Exception("Failed to save config")
                
        except Exception as e:
            self.logger.error(f"Error setting config: {e}")
            self._publish_response("error", {"error": str(e)})
    
    def _handle_get_network_config(self):
        """Handle get network config request"""
        try:
            success, config_data = self.read_current_ip_config()
            
            if success:
                response_data = {
                    "action": "get_network_config",
                    "status": "success",
                    "timestamp": datetime.now().isoformat(),
                    "network_method": self.network_method,
                    "network_config": config_data
                }
                self._publish_network_response("success", response_data)
                self.logger.info("Network config sent successfully")
            else:
                self._publish_network_response("error", {"error": config_data})
                
        except Exception as e:
            self.logger.error(f"Error getting network config: {e}")
            self._publish_network_response("error", {"error": str(e)})
    
    def _handle_set_network_config(self, payload_str):
        """Handle set network config request"""
        try:
            payload = json.loads(payload_str)
            
            interface = payload.get("interface", "eth0")
            method = payload.get("method")
            
            if not method:
                raise ValueError("Missing 'method' field")
            
            response_data = {
                "action": "set_network_config",
                "timestamp": datetime.now().isoformat(),
                "interface": interface,
                "method": method,
                "network_method": self.network_method
            }
            
            if method == "static":
                static_ip = payload.get("static_ip")
                netmask = payload.get("netmask", "255.255.255.0")
                gateway = payload.get("gateway")
                dns = payload.get("dns", "8.8.8.8 8.8.4.4")
                
                if not static_ip:
                    raise ValueError("Missing required static IP parameter: static_ip")
                
                if not gateway or gateway.strip() == "":
                    ip_parts = static_ip.split('.')
                    if len(ip_parts) == 4:
                        gateway = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.1"
                    else:
                        gateway = "192.168.0.1"
                    self.logger.info(f"Using default gateway: {gateway}")
                
                success, message = self.set_static_ip(interface, static_ip, netmask, gateway, dns)
                response_data.update({
                    "static_ip": static_ip,
                    "netmask": netmask,
                    "gateway": gateway,
                    "dns": dns
                })
                
            elif method == "dhcp":
                success, message = self.set_dynamic_ip(interface)
                
            else:
                raise ValueError(f"Invalid method: {method}. Must be 'static' or 'dhcp'")
            
            response_data["status"] = "success" if success else "error"
            response_data["message"] = message
            
            self._publish_network_response("success" if success else "error", response_data)
            
            if success:
                self.logger.info(f"Network config updated: {interface} -> {method}")
                
                if payload.get("reboot", False):
                    self.logger.info("Rebooting system after network configuration change...")
                    time.sleep(2)
                    os.system("sudo reboot")
            
        except Exception as e:
            self.logger.error(f"Error setting network config: {e}")
            self._publish_network_response("error", {"error": str(e)})
    
    def _handle_wifi_scan(self):
        """Handle WiFi scan request"""
        try:
            self.logger.info("Received WiFi scan request")
            wifi_networks = self.scan_wifi()
            
            response_data = {
                "action": "wifi_scan",
                "status": "success",
                "timestamp": datetime.now().isoformat(),
                "networks": wifi_networks,
                "count": len(wifi_networks)
            }
            
            self._publish_wifi_response("wifi_scan_response", response_data)
            self.logger.info(f"WiFi scan completed: {len(wifi_networks)} networks found")
            
        except Exception as e:
            self.logger.error(f"Error scanning WiFi: {e}")
            self._publish_wifi_response("wifi_scan_response", {
                "action": "wifi_scan",
                "status": "error", 
                "error": str(e)
            })
    
    def _handle_wifi_connect(self, payload_str):
        """Handle WiFi connect request"""
        try:
            payload = json.loads(payload_str)
            ssid = payload.get("ssid")
            password = payload.get("password")
            
            if not ssid:
                raise ValueError("Missing 'ssid' field")
            
            self.logger.info(f"Received WiFi connect request for: {ssid}")
            success, result = self.connect_wifi(ssid, password)
            
            response_data = {
                "action": "wifi_connect",
                "status": "success" if success else "error",
                "timestamp": datetime.now().isoformat(),
                "ssid": ssid,
                "message": f"Connected to {ssid}" if success else result,
                "ip_address": result if success else None
            }
            
            if not success:
                response_data["error"] = result
            
            self._publish_wifi_response("wifi_connect_response", response_data)
            
        except Exception as e:
            self.logger.error(f"Error connecting to WiFi: {e}")
            self._publish_wifi_response("wifi_connect_response", {
                "action": "wifi_connect",
                "status": "error",
                "error": str(e)
            })
    
    def _handle_wifi_disconnect(self):
        """Handle WiFi disconnect request"""
        try:
            self.logger.info("Received WiFi disconnect request")
            success, message = self.disconnect_current_wifi()
            
            response_data = {
                "action": "wifi_disconnect",
                "status": "success" if success else "error",
                "timestamp": datetime.now().isoformat(),
                "message": message
            }
            
            if not success:
                response_data["error"] = message
            
            self._publish_wifi_response("wifi_disconnect_response", response_data)
            
        except Exception as e:
            self.logger.error(f"Error disconnecting WiFi: {e}")
            self._publish_wifi_response("wifi_disconnect_response", {
                "action": "wifi_disconnect", 
                "status": "error",
                "error": str(e)
            })
    
    def _handle_wifi_delete(self, payload_str):
        """Handle WiFi delete request"""
        try:
            payload = json.loads(payload_str)
            ssid = payload.get("ssid")
            
            if not ssid:
                raise ValueError("Missing 'ssid' field")
            
            self.logger.info(f"Received WiFi delete request for: {ssid}")
            success, message = self.delete_wifi(ssid)
            
            response_data = {
                "action": "wifi_delete",
                "status": "success" if success else "error",
                "timestamp": datetime.now().isoformat(),
                "ssid": ssid,
                "message": message
            }
            
            if not success:
                response_data["error"] = message
            
            self._publish_wifi_response("wifi_delete_response", response_data)
            
        except Exception as e:
            self.logger.error(f"Error deleting WiFi: {e}")
            self._publish_wifi_response("wifi_delete_response", {
                "action": "wifi_delete",
                "status": "error", 
                "error": str(e)
            })
    

    def _handle_wifi_status_get(self):
        """Handle WiFi status get request - NEW HANDLER"""
        try:
            self.logger.info("Received WiFi status get request")
            wifi_status = self.get_wifi_status()
            
            response_data = {
                "action": "wifi_status_get",
                "status": "success",
                "timestamp": datetime.now().isoformat(),
                "wifi_status": wifi_status
            }
            
            # Add error to response if present
            if "error" in wifi_status:
                response_data["status"] = "partial_error"
                response_data["error_details"] = wifi_status["error"]
            
            self._publish_wifi_status_response(response_data)
            self.logger.info(f"WiFi status sent: Connected={wifi_status.get('connected', False)}")
            
        except Exception as e:
            self.logger.error(f"Error handling WiFi status request: {e}")
            self._publish_wifi_status_response({
                "action": "wifi_status_get",
                "status": "error",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            })
   
    def _restart_thermal_service(self):
        """Restart thermal service"""
        try:
            self.logger.info("Restarting thermal-mqtt service...")
            result = os.system("sudo systemctl restart thermal-mqtt")
            
            if result == 0:
                self.logger.info("Thermal service restarted successfully")
                return True
            else:
                self.logger.error("Failed to restart thermal service")
                return False
                
        except Exception as e:
            self.logger.error(f"Error restarting thermal service: {e}")
            return False
    
    def _publish_response(self, status, data):
        """Publish response"""
        try:
            response = {
                "status": status,
                "timestamp": datetime.now().isoformat(),
                "device_id": self.device_id,
                **data
            }
            
            self.mqtt_client.publish(
                self.topics["response"],
                json.dumps(response),
                qos=1
            )
            
        except Exception as e:
            self.logger.error(f"Error publishing response: {e}")
    
    def _publish_network_response(self, status, data):
        """Publish network response"""
        try:
            response = {
                "status": status,
                "timestamp": datetime.now().isoformat(),
                "device_id": self.device_id,
                **data
            }
            
            self.mqtt_client.publish(
                self.topics["network_response"],
                json.dumps(response),
                qos=1
            )
            
        except Exception as e:
            self.logger.error(f"Error publishing network response: {e}")
    
    def _publish_wifi_response(self, topic_key, data):
        """Publish WiFi response"""
        try:
            response = {
                "timestamp": datetime.now().isoformat(),
                "device_id": self.device_id,
                **data
            }
            
            self.mqtt_client.publish(
                self.topics[topic_key],
                json.dumps(response),
                qos=1
            )
            
        except Exception as e:
            self.logger.error(f"Error publishing WiFi response: {e}")
    

    def _publish_wifi_status_response(self, data):
        """Publish WiFi status response - NEW FUNCTION"""
        try:
            response = {
                "timestamp": datetime.now().isoformat(),
                "device_id": self.device_id,
                **data
            }
            
            self.mqtt_client.publish(
                self.topics["wifi_status_response"],
                json.dumps(response),
                qos=1
            )
            
        except Exception as e:
            self.logger.error(f"Error publishing WiFi status response: {e}")


    def start(self):
        """Start config manager"""
        self.logger.info("Starting RPi Config Manager with Network Management...")
        
        if not self.setup_mqtt():
            self.logger.error("Failed to setup MQTT")
            return False
        
        self.running = True
        
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.logger.info("Stopped by user")
        
        return True
    
    def stop(self):
        """Stop config manager"""
        self.logger.info("Stopping RPi Config Manager...")
        self.running = False
        
        if self.mqtt_client:
            time.sleep(1)
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        
        self.logger.info("RPi Config Manager stopped")

def signal_handler(signum, frame):
    print("Shutting down...")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

def main():
    manager = RPiConfigManager()
    manager.start()

if __name__ == "__main__":
    main()