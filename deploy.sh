#!/bin/bash
# IoT Dashboard Simple Deployment Script
# Port: 3000
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="thermal-dashboard"
APP_PORT=3000
NODE_VERSION="18"

# Log functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js installation
check_nodejs() {
    log "Checking Node.js installation..."
    if command_exists node && command_exists npm; then
        NODE_VERSION_INSTALLED=$(node --version | sed 's/v//')
        MAJOR_VERSION=$(echo $NODE_VERSION_INSTALLED | cut -d. -f1)
        if [ "$MAJOR_VERSION" -ge "$NODE_VERSION" ]; then
            log_success "Node.js v$NODE_VERSION_INSTALLED and npm $(npm --version) found"
            return 0
        else
            log_warning "Node.js version too old: v$NODE_VERSION_INSTALLED (required: v$NODE_VERSION+)"
            return 1
        fi
    else
        log_error "Node.js or npm not found"
        return 1
    fi
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js $NODE_VERSION..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
    log_success "Node.js $(node --version) installed"
}

# Check PM2
check_pm2() {
    if command_exists pm2; then
        log_success "PM2 v$(pm2 --version) found"
        return 0
    else
        log_error "PM2 not found"
        return 1
    fi
}

# Install PM2
install_pm2() {
    log "Installing PM2..."
    sudo npm install -g pm2
    pm2 startup | grep "sudo env" | bash || true
    log_success "PM2 installed"
}

# Create environment file
create_env_file() {
    log "Creating .env.local file..."
    cd "$PROJECT_ROOT"
    
    cat > .env.local << 'EOF'
# MQTT Configuration

NEXT_PUBLIC_MQTT_PORT=9000
EOF
    
    chmod 600 .env.local
    log_success "Environment file created"
}

# Install dependencies
install_dependencies() {
    log "Installing npm dependencies..."
    cd "$PROJECT_ROOT"
    npm install
    log_success "Dependencies installed"
}

# Build application
build_app() {
    log "Building application..."
    cd "$PROJECT_ROOT"
    
    # Clean previous build
    if [ -d ".next" ]; then
        rm -rf .next
    fi
    
    npm run build
    
    if [ ! -d ".next" ]; then
        log_error "Build failed"
        exit 1
    fi
    
    log_success "Application built successfully"
}

# Create PM2 config
create_pm2_config() {
    log "Creating PM2 configuration..."
    cd "$PROJECT_ROOT"
    
    mkdir -p logs
    
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: '$APP_NAME',
      script: 'npm',
      args: 'start',
      cwd: '$PROJECT_ROOT',
      env: {
        NODE_ENV: 'production',
        PORT: $APP_PORT
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log'
    }
  ]
};
EOF
    
    log_success "PM2 configuration created"
}

# Start with PM2
start_app() {
    log "Starting application with PM2..."
    cd "$PROJECT_ROOT"
    
    # Stop if already running
    pm2 stop "$APP_NAME" 2>/dev/null || true
    pm2 delete "$APP_NAME" 2>/dev/null || true
    
    # Start app
    pm2 start ecosystem.config.js
    pm2 save
    
    log "Waiting for app to start..."
    sleep 10
    
    if pm2 list | grep -q "$APP_NAME.*online"; then
        log_success "Application started successfully"
    else
        log_error "Failed to start application"
        pm2 logs "$APP_NAME" --lines 10
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    local app_ready=false
    for i in {1..30}; do
        if curl -s http://localhost:$APP_PORT > /dev/null 2>&1; then
            app_ready=true
            break
        fi
        sleep 2
    done
    
    if [ "$app_ready" = true ]; then
        log_success "Application is responding on port $APP_PORT"
    else
        log_error "Application health check failed"
        return 1
    fi
}

# Show status
show_status() {
    log "=== Deployment Complete ==="
    
    echo ""
    log "Application Status:"
    pm2 list
    
    echo ""
    log "Access URLs:"
    echo "  Local: http://localhost:$APP_PORT"
    echo "  Network: http://$(hostname -I | awk '{print $1}'):$APP_PORT"
    
    echo ""
    log "Useful Commands:"
    echo "  View logs: pm2 logs $APP_NAME"
    echo "  Restart: pm2 restart $APP_NAME"
    echo "  Stop: pm2 stop $APP_NAME"
    echo "  Monitor: pm2 monit"
    
    echo ""
    log_success "Thermal Dashboard deployed successfully!"
    log_warning "Make sure MQTT broker is running on 127.0.0.1:9000"
}

# Main function
main() {
    log "=== Thermal Dashboard Deployment ==="
    log "Project: $PROJECT_ROOT"
    log "Port: $APP_PORT"
    
    # Update system
    sudo apt-get update
    
    # Install Node.js if needed
    if ! check_nodejs; then
        install_nodejs
    fi
    
    # Install PM2 if needed
    if ! check_pm2; then
        install_pm2
    fi
    
    # Create environment
    create_env_file
    
    # Install dependencies
    install_dependencies
    
    # Build application
    build_app
    
    # Setup PM2
    create_pm2_config
    
    # Start application
    start_app
    
    # Verify
    if verify_deployment; then
        show_status
    else
        log_error "Deployment verification failed"
        exit 1
    fi
}

# Run script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi