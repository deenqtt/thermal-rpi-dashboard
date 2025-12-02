# Thermal RPi Dashboard

Dashboard monitoring real-time untuk kamera thermal berbasis Raspberry Pi dengan visualisasi heatmap, konfigurasi perangkat, dan manajemen jaringan.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15.5.3-black.svg)
![React](https://img.shields.io/badge/React-19.1.0-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6.svg)
![License](https://img.shields.io/badge/license-Private-red.svg)

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Teknologi yang Digunakan](#teknologi-yang-digunakan)
- [Persyaratan Sistem](#persyaratan-sistem)
- [Instalasi](#instalasi)
  - [1. Setup Raspberry Pi](#1-setup-raspberry-pi)
  - [2. Setup Dashboard (Web App)](#2-setup-dashboard-web-app)
  - [3. Setup Middleware](#3-setup-middleware)
- [Konfigurasi](#konfigurasi)
- [Deployment](#deployment)
- [User Manual](#user-manual)
  - [Dashboard Utama](#dashboard-utama)
  - [Halaman Settings](#halaman-settings)
- [Troubleshooting](#troubleshooting)
- [Struktur Project](#struktur-project)
- [API & MQTT Topics](#api--mqtt-topics)
- [Pengembangan](#pengembangan)

---

## Fitur Utama

### 1. Real-Time Thermal Monitoring
- **Visualisasi Heatmap**: Tampilan thermal array 80x62 pixel dengan color-coded temperature
- **Live Statistics**: Min, Max, Average temperature real-time
- **Frame Control**: Pause/Resume, FPS adjustment (1-15 FPS), Auto-reset counter
- **Performance Optimized**: Frame limiting untuk efisiensi bandwidth

### 2. Device Configuration
- **Device Identity**: Device ID, Name, Location management
- **MQTT Settings**: Broker host/port, authentication, QoS, keepalive
- **Topic Templates**: Pre-configured topic patterns untuk berbagai use case (factory, building, warehouse)
- **Thermal Settings**: Interface detection, publishing interval

### 3. Network Management
- **Ethernet Config**: DHCP atau Static IP configuration
- **Auto-Redirect**: Otomatis redirect ke IP baru setelah konfigurasi static IP
- **Network Status**: Real-time network interface monitoring

### 4. WiFi Management
- **Network Scanner**: Scan WiFi networks dengan signal strength
- **WiFi Connect/Disconnect**: Manajemen koneksi WiFi dengan password
- **Saved Networks**: Manage saved WiFi credentials
- **Security Detection**: Menampilkan tipe keamanan WiFi (WPA/WPA2/Open)

### 5. System Control
- **Reboot System**: Remote reboot Raspberry Pi
- **Factory Reset**: Reset ke konfigurasi default
- **Physical Button**: GPIO26 button untuk reboot (5 detik) atau factory reset (10 detik)

### 6. Modern UI/UX
- **Responsive Design**: Mobile-friendly interface
- **Real-time Updates**: Live data streaming via MQTT WebSocket
- **Toast Notifications**: User feedback untuk setiap aksi
- **Dark Mode Ready**: Mendukung tema gelap

---

## Teknologi yang Digunakan

### Frontend
- **Next.js 15.5.3**: React framework dengan App Router
- **React 19.1.0**: UI library
- **TypeScript 5**: Type-safe development
- **Tailwind CSS 3.4**: Utility-first CSS framework
- **Radix UI**: Headless UI components
- **Paho MQTT**: MQTT client untuk WebSocket connection
- **Lucide React**: Icon library

### Backend/Middleware
- **Python 3**: Middleware untuk thermal sensor dan config manager
- **Paho MQTT (Python)**: MQTT publisher/subscriber
- **gpiozero**: GPIO control untuk button handler
- **Mosquitto**: MQTT broker dengan WebSocket support

### DevOps
- **PM2**: Process manager untuk production
- **systemd**: Service management untuk Python middleware

---

## Persyaratan Sistem

### Raspberry Pi (Thermal Sensor Device)
- **Hardware**:
  - Raspberry Pi 3/4/5 (recommended: RPi 4 atau lebih tinggi)
  - Thermal Camera Module (80x62 resolution, USB interface)
  - MicroSD card minimal 16GB (recommended: 32GB Class 10)
  - Power supply 5V 3A
  - Push button untuk GPIO26 (optional, untuk physical reset)

- **Software**:
  - Raspberry Pi OS (Bullseye atau lebih baru)
  - Python 3.7+
  - Mosquitto MQTT Broker dengan WebSocket enabled
  - systemd (sudah termasuk di Raspberry Pi OS)

### Dashboard Server (dapat dijalankan di RPi yang sama atau terpisah)
- **Hardware**:
  - Raspberry Pi 3/4/5 atau PC/Server Linux
  - Minimal 1GB RAM (recommended: 2GB+)
  - Storage minimal 500MB untuk aplikasi

- **Software**:
  - Node.js 18+ dan npm
  - PM2 (akan diinstall otomatis)

### Client (Browser)
- Modern web browser dengan WebSocket support:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

---

## Instalasi

### 1. Setup Raspberry Pi

#### a. Update System
```bash
sudo apt update
sudo apt upgrade -y
```

#### b. Install Mosquitto MQTT Broker
```bash
sudo apt install -y mosquitto mosquitto-clients
```

#### c. Enable WebSocket di Mosquitto
Edit konfigurasi Mosquitto:
```bash
sudo nano /etc/mosquitto/conf.d/websocket.conf
```

Tambahkan:
```conf
# Standard MQTT
listener 1883
protocol mqtt

# WebSocket for web clients
listener 9000
protocol websockets
allow_anonymous true
```

Restart Mosquitto:
```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

#### d. Verifikasi Mosquitto
```bash
sudo systemctl status mosquitto
netstat -tln | grep -E '1883|9000'
```

Seharusnya port 1883 (MQTT) dan 9000 (WebSocket) listening.

---

### 2. Setup Dashboard (Web App)

#### a. Clone atau Copy Project
```bash
cd /home/pi
git clone <repository-url> thermal-rpi-dashboard
# atau copy folder project ke /home/pi/thermal-rpi-dashboard
```

#### b. Install Dependencies
```bash
cd thermal-rpi-dashboard
npm install
```

#### c. Konfigurasi Environment
Edit file `.env.local`:
```bash
nano .env.local
```

Sesuaikan dengan IP Raspberry Pi Anda:
```env
# MQTT Configuration
NEXT_PUBLIC_MQTT_BROKER=192.168.0.92
NEXT_PUBLIC_MQTT_PORT=9000
```

**Tips**:
- Gunakan IP Raspberry Pi jika dashboard diakses dari jaringan
- Gunakan `localhost` jika dashboard running di RPi yang sama dengan MQTT broker

#### d. Build Production
```bash
npm run build
```

#### e. Deploy dengan Script Otomatis
```bash
chmod +x deploy.sh
./deploy.sh
```

Script deploy akan:
- Install Node.js jika belum ada
- Install PM2 process manager
- Build aplikasi
- Konfigurasi PM2 ecosystem
- Start aplikasi di port 3000
- Setup auto-start saat reboot

---

### 3. Setup Middleware

#### a. Setup Thermal Publisher (`pub.py`)

Copy file `middleware/pub.py` ke directory project thermal sensor:
```bash
# Contoh struktur yang diharapkan
/home/pi/thermal_mqtt_project/
├── config/
│   └── mqtt_config.json
├── middleware/
│   ├── pub.py
│   └── thermal_utils.py
└── logs/
```

Edit konfigurasi `config/mqtt_config.json`:
```json
{
  "device": {
    "device_id": "thermal_cam_rpi1",
    "device_name": "Thermal Camera USB",
    "location": "Container"
  },
  "mqtt": {
    "broker_host": "localhost",
    "broker_port": 1883,
    "keepalive": 60,
    "qos": 1,
    "username": null,
    "password": null
  },
  "topic": "sensors/thermal_stream",
  "thermal": {
    "interface": "usb",
    "auto_detect": true
  },
  "publishing": {
    "interval": 0.1
  }
}
```

Create systemd service:
```bash
sudo nano /etc/systemd/system/thermal-publisher.service
```

```ini
[Unit]
Description=Thermal MQTT Publisher
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/thermal_mqtt_project
ExecStart=/usr/bin/python3 /home/pi/thermal_mqtt_project/middleware/pub.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable dan start service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable thermal-publisher.service
sudo systemctl start thermal-publisher.service
sudo systemctl status thermal-publisher.service
```

#### b. Setup Config Manager (`rpi_config_manager.py`)

Copy file `middleware/rpi_config_manager.py`:
```bash
sudo cp middleware/rpi_config_manager.py /usr/local/bin/
sudo chmod +x /usr/local/bin/rpi_config_manager.py
```

Create systemd service:
```bash
sudo nano /etc/systemd/system/rpi-config-manager.service
```

```ini
[Unit]
Description=RPi Configuration Manager
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /usr/local/bin/rpi_config_manager.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable dan start service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable rpi-config-manager.service
sudo systemctl start rpi-config-manager.service
sudo systemctl status rpi-config-manager.service
```

---

## Konfigurasi

### MQTT Topics

Dashboard menggunakan beberapa MQTT topics:

#### Thermal Data
- `sensors/thermal_stream` - Thermal data streaming

#### Config Management
- `rpi/config/get` - Request device config
- `rpi/config/set` - Update device config
- `rpi/config/response` - Config response

#### Network Management
- `rpi/network/get` - Get network config
- `rpi/network/set` - Set network config (DHCP/Static IP)
- `rpi/network/response` - Network config response

#### WiFi Management
- `rpi/wifi/scan` - Scan WiFi networks
- `rpi/wifi/scan_response` - Scan results
- `rpi/wifi/connect` - Connect to WiFi
- `rpi/wifi/connect_response` - Connection status
- `rpi/wifi/disconnect` - Disconnect WiFi
- `rpi/wifi/delete` - Delete saved network

#### System Control
- `rpi/system/reboot` - Reboot system
- `rpi/system/factory_reset` - Factory reset

---

## Deployment

### Development Mode
```bash
npm run dev
```
Aplikasi akan berjalan di http://localhost:3000

### Production Mode (Manual)
```bash
npm run build
npm start
```

### Production Mode (PM2 - Recommended)
```bash
# Start
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs thermal-dashboard

# Restart
pm2 restart thermal-dashboard

# Stop
pm2 stop thermal-dashboard

# Remove
pm2 delete thermal-dashboard

# Save PM2 config (auto-start on boot)
pm2 save
pm2 startup
```

### Auto Deploy Script
```bash
./deploy.sh
```

---

## User Manual

### Dashboard Utama

#### A. Mengakses Dashboard
1. Buka browser dan akses:
   - Local: `http://localhost:3000`
   - Network: `http://<RASPBERRY_PI_IP>:3000`

2. Dashboard akan otomatis connect ke MQTT broker

#### B. Thermal Heatmap
![Dashboard Main View]

**Komponen Heatmap:**
- **Color Gradient**:
  - Biru = Suhu rendah
  - Hijau = Suhu sedang
  - Kuning = Suhu tinggi
  - Merah = Suhu sangat tinggi

- **Overlay Information**:
  - Top-left: Max & Min temperature
  - Top-right: Frame number
  - Bottom-left: Average temperature
  - Bottom-right: Last update timestamp

#### C. Controls & Settings

**1. FPS Control**
- Dropdown menu untuk set frame rate (1, 2, 5, 10, 15 FPS)
- FPS lebih rendah = bandwidth lebih hemat
- FPS lebih tinggi = update lebih real-time

**2. Auto Reset Toggle**
- ON: Frame counter otomatis reset ke 1 setelah mencapai 100
- OFF: Counter akan terus naik tanpa reset

**3. Reset Frame Button**
- Manual reset frame counter ke 1
- Berguna untuk mulai perhitungan baru

**4. Pause/Resume Button**
- Pause: Hentikan update data (streaming tetap berjalan)
- Resume: Lanjutkan update visualisasi

#### D. Statistics Cards

**Average Temperature Card:**
- Menampilkan suhu rata-rata dari semua pixel
- Range: min - max temperature

**Connection Status Card:**
- Status koneksi MQTT (Connected/Connecting/Disconnected)
- Topic: sensors/thermal_stream

**Total Pixels Card:**
- Jumlah pixel sensor (4960 untuk 80x62)
- Interface type (USB)

**Frame Rate Card:**
- Actual FPS yang tercapai
- Target FPS yang diset

#### E. Info Panel (Sidebar)

**Live Statistics:**
- Min Temp: Suhu terendah yang terdeteksi
- Max Temp: Suhu tertinggi yang terdeteksi
- Average: Suhu rata-rata

**System Info:**
- MQTT Status: Status koneksi broker
- Frame Rate: FPS real-time
- Device ID: Identifier thermal device
- Location: Lokasi device
- Interface: Tipe koneksi (USB/I2C)
- Resolution: Resolusi sensor (80x62)
- Last Update: Timestamp update terakhir

---

### Halaman Settings

Akses via menu sidebar atau URL: `http://<IP>:3000/settings`

#### Tab 1: Device Configuration

**Fungsi**: Konfigurasi identitas device

**Field:**
- **Device ID**: Unique identifier (e.g., `thermal_cam_rpi1`)
- **Device Name**: Nama yang mudah dibaca (e.g., `Thermal Camera USB`)
- **Location**: Lokasi device (e.g., `Container`, `Room A`)

**Cara Penggunaan:**
1. Edit field yang ingin diubah
2. Klik tombol "Save Configuration"
3. Tunggu notifikasi sukses
4. Klik "Reload" untuk refresh dari server

---

#### Tab 2: MQTT Configuration

**Fungsi**: Setting MQTT broker dan connection parameters

**Field:**

1. **Broker Host**: IP address MQTT broker
   - Contoh: `192.168.0.138` atau `localhost`

2. **Port**: MQTT port (default: 1883)

3. **MQTT Topic**: Topic untuk publish thermal data
   - **Topic Templates** disediakan untuk berbagai use case:

     **Standard Patterns:**
     - `sensors/thermal_cam_rpi/data`
     - `sensors/thermal_stream/001`

     **Factory/Industrial:**
     - `factory/thermal/zone1/data`
     - `factory/line1/thermal/data`
     - `warehouse/thermal/gate/data`

     **Building/HVAC:**
     - `building/hvac/thermal/data`
     - `office/floor2/thermal/data`

   - **Auto-Discovery Patterns**:
     - `sensors/thermal_stream/+`
     - `+/thermal/+/data`
     - Mendukung multi-device discovery

4. **Username & Password**: (Optional) MQTT authentication

5. **Keep Alive**: Interval ping ke broker (default: 60 detik)

6. **QoS Level**: Quality of Service
   - 0: At most once (fastest, no guarantee)
   - 1: At least once (recommended)
   - 2: Exactly once (slowest, highest guarantee)

**Cara Penggunaan:**
1. Isi atau edit field yang diperlukan
2. Pilih topic dari template atau buat custom
3. Klik "Save MQTT Config"
4. Restart thermal publisher service untuk apply:
   ```bash
   sudo systemctl restart thermal-publisher
   ```

---

#### Tab 3: Network Configuration

**Fungsi**: Konfigurasi Ethernet interface (DHCP atau Static IP)

**Field:**

1. **Interface**: Pilih network interface
   - `eth0` (Ethernet)

2. **IP Method**:
   - **DHCP (Automatic)**: IP otomatis dari router
   - **Static IP**: IP manual

**Static IP Configuration** (jika Static IP dipilih):
- **IP Address**: IP yang diinginkan (e.g., `192.168.0.100`)
- **Netmask**: Subnet mask (default: `255.255.255.0`)
- **Gateway**: IP router (e.g., `192.168.0.1`)
- **DNS Servers**: DNS servers (default: `8.8.8.8 8.8.4.4`)

**Current Network Status**: Menampilkan status interface saat ini

**Cara Penggunaan:**

**A. Set DHCP (Automatic):**
1. Pilih Interface: `eth0`
2. Pilih Method: `DHCP (Automatic)`
3. Klik "Apply Network Config"
4. Tunggu konfirmasi sukses
5. Device akan mendapat IP otomatis dari router

**B. Set Static IP:**
1. Pilih Interface: `eth0`
2. Pilih Method: `Static IP`
3. Isi konfigurasi:
   - IP Address: `192.168.0.100`
   - Netmask: `255.255.255.0`
   - Gateway: `192.168.0.1`
   - DNS: `8.8.8.8 8.8.4.4`
4. Klik "Apply Network Config"
5. **Auto-Redirect**:
   - Countdown 5 detik akan muncul
   - Browser otomatis redirect ke IP baru
   - Atau klik "Redirect Now" untuk langsung
   - Klik "Cancel" untuk membatalkan redirect

**PENTING:**
- Pastikan IP yang dipilih tidak konflik dengan device lain
- Pastikan IP masih dalam range network yang sama dengan router
- Setelah apply, koneksi sementara bisa terputus selama network restart

---

#### Tab 4: WiFi Management

**Fungsi**: Scan, connect, dan manage WiFi networks

**A. WiFi Scanner Panel**

**Cara Scan WiFi:**
1. Klik icon "Search" di pojok kanan panel
2. Tunggu proses scanning (sekitar 5-10 detik)
3. List network akan muncul dengan informasi:
   - SSID (nama network)
   - Security type (WPA/WPA2/Open)
   - Signal strength (%)

**Memilih Network:**
- Klik pada network yang diinginkan
- SSID akan otomatis terisi di form WiFi Connection

**B. WiFi Connection Panel**

**Cara Connect ke WiFi:**
1. **Input SSID**:
   - Ketik manual atau pilih dari hasil scan

2. **Input Password**:
   - Masukkan password WiFi
   - Check "Show password" untuk melihat password
   - Skip untuk open network

3. **Connect**:
   - Klik tombol "Connect"
   - Tunggu notifikasi status
   - Jika sukses, IP address WiFi akan ditampilkan

**Disconnect WiFi:**
- Klik icon WiFi Off untuk disconnect dari network aktif

**C. Saved Networks Panel**

**Fungsi**: Manage WiFi credentials yang sudah tersimpan

**Aksi:**
- **Connect**: Quick connect ke saved network (tanpa password)
- **Delete**: Hapus network dari saved list

---

#### Tab 5: Thermal Configuration

**Fungsi**: View thermal sensor settings (read-only)

**Informasi yang Ditampilkan:**
- **Interface**: Tipe koneksi sensor (USB/I2C)
- **Auto Detect**: Status auto-detection
- **Publishing Interval**: Interval publish data (detik)
- **Topic**: MQTT topic yang digunakan

**Note**: Tab ini hanya menampilkan informasi. Untuk mengubah setting thermal, edit file config JSON dan restart service.

---

#### Tab 6: System Control

**Fungsi**: System-level operations

**A. Reboot System**
- Restart Raspberry Pi
- Semua service akan restart
- Dashboard akan disconnect sementara (30-60 detik)

**Cara Reboot:**
1. Klik tombol "Reboot"
2. Konfirmasi di notifikasi
3. Tunggu sekitar 1 menit
4. Refresh browser

**B. Factory Reset**
- Reset semua konfigurasi ke default
- Network config akan di-reset
- WiFi credentials akan dihapus
- MQTT config akan di-reset
- **Data thermal tidak akan hilang**

**Cara Factory Reset:**
1. Klik tombol "Factory Reset" (merah)
2. Konfirmasi aksi
3. Device akan reboot otomatis
4. Konfigurasi ulang dari awal

**PERINGATAN:**
- Factory reset tidak bisa di-undo
- Backup konfigurasi penting sebelum reset
- Catat IP address sebelum reset jika menggunakan static IP

---

### Physical Button Control (GPIO26)

Raspberry Pi dilengkapi dengan physical button di GPIO26 untuk emergency control.

**Fungsi Button:**

**1. Reboot (Press 5-10 detik):**
- Tekan dan tahan button
- LED atau log akan indikasi proses
- Lepas setelah 5 detik
- System akan reboot

**2. Factory Reset (Press > 10 detik):**
- Tekan dan tahan button
- Tahan lebih dari 10 detik
- LED atau log akan indikasi proses
- Lepas setelah indicator
- System akan factory reset dan reboot

**Wiring:**
```
GPIO26 ----[Button]---- GND
         (dengan pull-up internal)
```

**Log Monitoring:**
```bash
# Monitor button events
sudo journalctl -u rpi-config-manager -f
```

---

## Troubleshooting

### Problem: Dashboard tidak bisa connect ke MQTT

**Diagnosis:**
```bash
# Cek Mosquitto status
sudo systemctl status mosquitto

# Cek port listening
netstat -tln | grep -E '1883|9000'

# Test MQTT connection
mosquitto_sub -h localhost -p 1883 -t '#' -v
```

**Solusi:**
1. Restart Mosquitto:
   ```bash
   sudo systemctl restart mosquitto
   ```

2. Cek firewall:
   ```bash
   sudo ufw allow 1883
   sudo ufw allow 9000
   sudo ufw allow 3000
   ```

3. Cek WebSocket config di `/etc/mosquitto/conf.d/websocket.conf`

---

### Problem: Thermal data tidak muncul

**Diagnosis:**
```bash
# Cek thermal publisher service
sudo systemctl status thermal-publisher

# Cek logs
sudo journalctl -u thermal-publisher -f

# Test MQTT manual
mosquitto_sub -h localhost -p 1883 -t 'sensors/thermal_stream' -v
```

**Solusi:**
1. Restart publisher:
   ```bash
   sudo systemctl restart thermal-publisher
   ```

2. Cek thermal sensor connection:
   ```bash
   lsusb  # untuk USB thermal camera
   ```

3. Cek config file di `/home/pi/thermal_mqtt_project/config/mqtt_config.json`

---

### Problem: Network config tidak apply

**Diagnosis:**
```bash
# Cek config manager
sudo systemctl status rpi-config-manager

# Cek network interfaces
ip addr show
```

**Solusi:**
1. Restart config manager:
   ```bash
   sudo systemctl restart rpi-config-manager
   ```

2. Manual config (jika NetworkManager):
   ```bash
   sudo nmcli con show
   sudo nmcli con mod "Wired connection 1" ipv4.method manual ipv4.addr "192.168.0.100/24" ipv4.gateway "192.168.0.1"
   sudo nmcli con up "Wired connection 1"
   ```

---

### Problem: Dashboard crash atau tidak respond

**Diagnosis:**
```bash
# Cek PM2 status
pm2 list

# Cek logs
pm2 logs thermal-dashboard --lines 50
```

**Solusi:**
1. Restart dashboard:
   ```bash
   pm2 restart thermal-dashboard
   ```

2. Jika masih error, rebuild:
   ```bash
   cd /path/to/thermal-rpi-dashboard
   npm run build
   pm2 restart thermal-dashboard
   ```

3. Clear cache dan restart:
   ```bash
   pm2 delete thermal-dashboard
   rm -rf .next
   npm run build
   pm2 start ecosystem.config.js
   ```

---

### Problem: WiFi tidak terdeteksi atau tidak bisa connect

**Diagnosis:**
```bash
# Cek WiFi interface
ip link show

# Cek WiFi available
sudo iwlist wlan0 scan | grep ESSID

# Cek NetworkManager
sudo nmcli dev wifi list
```

**Solusi:**
1. Restart NetworkManager:
   ```bash
   sudo systemctl restart NetworkManager
   ```

2. Manual WiFi connect:
   ```bash
   sudo nmcli dev wifi connect "SSID" password "PASSWORD"
   ```

3. Jika masih gagal, cek WiFi region:
   ```bash
   sudo raspi-config
   # Localisation Options > WLAN Country
   ```

---

## Struktur Project

```
thermal-rpi-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Dashboard utama
│   │   ├── settings/
│   │   │   └── page.tsx             # Halaman settings
│   │   └── layout.tsx               # Root layout
│   ├── components/
│   │   ├── ui/                      # Radix UI components
│   │   ├── app-sidebar.tsx          # Sidebar navigation
│   │   └── settings/                # Settings components
│   └── lib/
│       ├── mqtt.ts                  # MQTT client singleton
│       ├── types.ts                 # TypeScript types
│       └── utils.ts                 # Utility functions
├── middleware/
│   ├── pub.py                       # Thermal MQTT publisher
│   └── rpi_config_manager.py       # RPi config manager
├── public/                          # Static assets
├── hooks/                           # React hooks (jika ada)
├── .env.local                       # Environment variables
├── package.json                     # NPM dependencies
├── tsconfig.json                    # TypeScript config
├── tailwind.config.js               # Tailwind CSS config
├── next.config.mjs                  # Next.js config
├── deploy.sh                        # Deployment script
├── ecosystem.config.js              # PM2 config (generated)
└── README.md                        # Dokumentasi ini
```

---

## API & MQTT Topics

### MQTT Message Format

#### Thermal Data Stream
**Topic**: `sensors/thermal_stream`

**Payload** (JSON):
```json
{
  "device_id": "thermal_cam_rpi1",
  "device_name": "Thermal Camera USB",
  "location": "Container",
  "interface": "usb",
  "frame_count": 42,
  "thermal_data": {
    "raw_array": [25.2, 25.3, ..., 30.5],  // 4960 elements (80x62)
    "statistics": {
      "min_temp": 24.5,
      "max_temp": 35.2,
      "avg_temp": 28.7,
      "total_pixels": 4960
    }
  },
  "metadata": {
    "resolution": "80x62",
    "units": "celsius"
  }
}
```

---

#### Config Get Request
**Topic**: `rpi/config/get`

**Payload**: `{}`

---

#### Config Get Response
**Topic**: `rpi/config/response`

**Payload**:
```json
{
  "status": "success",
  "action": "get_config",
  "config": {
    "device": {
      "device_id": "thermal_cam_rpi1",
      "device_name": "Thermal Camera USB",
      "location": "Container"
    },
    "mqtt": {
      "broker_host": "localhost",
      "broker_port": 1883,
      "keepalive": 60,
      "qos": 1,
      "username": null,
      "password": null
    },
    "topic": "sensors/thermal_stream",
    "thermal": {
      "interface": "usb",
      "auto_detect": true
    },
    "publishing": {
      "interval": 0.1
    }
  }
}
```

---

#### Network Get Response
**Topic**: `rpi/network/response`

**Payload**:
```json
{
  "status": "success",
  "action": "get_network_config",
  "network_config": {
    "eth0": {
      "method": "static",
      "address": "192.168.0.100",
      "netmask": "255.255.255.0",
      "gateway": "192.168.0.1",
      "dns-nameservers": "8.8.8.8 8.8.4.4",
      "state": "up"
    }
  }
}
```

---

#### WiFi Scan Response
**Topic**: `rpi/wifi/scan_response`

**Payload**:
```json
{
  "status": "success",
  "count": 5,
  "networks": [
    {
      "ssid": "MyWiFi",
      "security": "WPA2",
      "signal": "85"
    },
    {
      "ssid": "Office_Network",
      "security": "WPA2",
      "signal": "72"
    }
  ]
}
```

---

## Pengembangan

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run development server**:
   ```bash
   npm run dev
   ```

3. **Access**:
   - Dashboard: http://localhost:3000
   - Settings: http://localhost:3000/settings

### Build Production

```bash
npm run build
npm start
```

### Lint & Type Check

```bash
npm run lint
npx tsc --noEmit
```

### Environment Variables

`.env.local`:
```env
NEXT_PUBLIC_MQTT_BROKER=192.168.0.92
NEXT_PUBLIC_MQTT_PORT=9000
```

**Note**:
- Variabel dengan prefix `NEXT_PUBLIC_` akan di-expose ke browser
- Restart dev server setelah edit `.env.local`

---

### Adding New Features

#### 1. Add New MQTT Topic

**Frontend** (`lib/mqtt.ts`):
```typescript
// Subscribe di component
useEffect(() => {
  const mqttClient = getMQTTClient();
  mqttClient.subscribe("new/topic/name");
}, []);

// Listen message
useEffect(() => {
  const handleMessage = (event: CustomEvent) => {
    const { topic, payload } = event.detail;
    if (topic === "new/topic/name") {
      // Handle message
    }
  };
  window.addEventListener("mqttMessage", handleMessage);
  return () => window.removeEventListener("mqttMessage", handleMessage);
}, []);
```

**Backend** (`middleware/rpi_config_manager.py`):
```python
# Add topic
self.topics["new_topic"] = "new/topic/name"

# Subscribe
self.mqtt_client.subscribe(self.topics["new_topic"])

# Publish
self.mqtt_client.publish(
    self.topics["new_topic"],
    json.dumps({"data": "value"}),
    qos=1
)
```

---

#### 2. Add New Settings Tab

1. Edit `src/app/settings/page.tsx`
2. Add new `TabsTrigger`:
   ```tsx
   <TabsTrigger value="new-tab">
     <Icon className="w-4 h-4" />
     New Tab
   </TabsTrigger>
   ```
3. Add new `TabsContent`:
   ```tsx
   <TabsContent value="new-tab">
     {/* Your content */}
   </TabsContent>
   ```

---

#### 3. Add New UI Component

1. Create component di `src/components/ui/`:
   ```tsx
   // src/components/ui/my-component.tsx
   export function MyComponent() {
     return <div>My Component</div>;
   }
   ```

2. Import dan gunakan:
   ```tsx
   import { MyComponent } from "@/components/ui/my-component";
   ```

---

## Performance Tips

### 1. FPS Control
- Set FPS rendah (1-2) untuk monitoring jangka panjang
- Set FPS tinggi (10-15) untuk analisis detail
- Lower FPS = hemat bandwidth & CPU

### 2. MQTT QoS
- QoS 0: Fastest, untuk data yang bisa lost
- QoS 1: Recommended untuk thermal data
- QoS 2: Slowest, untuk critical commands

### 3. Network Bandwidth
```
Estimasi bandwidth (QoS 1):
- 1 FPS: ~5 KB/s
- 5 FPS: ~25 KB/s
- 10 FPS: ~50 KB/s
- 15 FPS: ~75 KB/s
```

---

## Security Considerations

### 1. MQTT Authentication
Untuk production, enable MQTT authentication:

Edit `/etc/mosquitto/conf.d/websocket.conf`:
```conf
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Create user:
```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd username
sudo systemctl restart mosquitto
```

Update config di dashboard dan middleware.

### 2. Network Security
- Gunakan firewall untuk restrict access
- Set static IP di trusted VLAN
- Gunakan VPN untuk remote access

### 3. Dashboard Access
- Setup reverse proxy (nginx) dengan SSL
- Add basic auth untuk production
- Use environment variable untuk sensitive data

---

## License

Private - All Rights Reserved

---

## Support & Contact

Untuk bantuan atau pertanyaan:
- GitHub Issues: [Repository URL]
- Email: [Your Email]
- Documentation: README ini

---

## Changelog

### Version 0.1.0 (Initial Release)
- Real-time thermal monitoring dashboard
- MQTT-based communication
- Device configuration management
- Network configuration (DHCP/Static IP)
- WiFi management
- System control (reboot, factory reset)
- Auto-redirect on IP change
- Physical button support (GPIO26)
- PM2 deployment automation

---

## Acknowledgments

- Next.js Team untuk framework
- Radix UI untuk headless components
- Eclipse Paho untuk MQTT client library
- Tailwind CSS untuk styling framework

---

**Selamat menggunakan Thermal RPi Dashboard!**

Untuk pertanyaan lebih lanjut, silakan buka issue di repository atau hubungi maintainer.
