#!/bin/bash

# YouTube Downloader (ytd.py) Setup Script
# This script installs all required dependencies for the YouTube downloader

set -e  # Exit on any error

echo "🚀 Setting up YouTube Downloader (ytd.py)"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect operating system
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        OS="windows"
    else
        OS="unknown"
    fi
    print_status "Detected OS: $OS"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Homebrew (macOS only)
install_homebrew() {
    if [[ "$OS" == "macos" ]]; then
        if command_exists brew; then
            print_success "Homebrew already installed"
        else
            print_status "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            print_success "Homebrew installed successfully"
        fi
    fi
}

# Install FFmpeg
install_ffmpeg() {
    print_status "Checking for FFmpeg..."
    
    if command_exists ffmpeg; then
        print_success "FFmpeg already installed"
        ffmpeg -version | head -1
        return 0
    fi

    print_status "Installing FFmpeg..."
    
    case "$OS" in
        "macos")
            if command_exists brew; then
                brew install ffmpeg
            else
                print_error "Homebrew not found. Please install Homebrew first."
                exit 1
            fi
            ;;
        "linux")
            if command_exists apt-get; then
                sudo apt-get update
                sudo apt-get install -y ffmpeg
            elif command_exists yum; then
                sudo yum install -y ffmpeg
            elif command_exists pacman; then
                sudo pacman -S ffmpeg
            else
                print_error "Could not detect package manager. Please install FFmpeg manually."
                exit 1
            fi
            ;;
        "windows")
            print_warning "Please install FFmpeg manually on Windows:"
            print_warning "1. Download from https://ffmpeg.org/download.html"
            print_warning "2. Extract and add to your PATH"
            print_warning "3. Restart your terminal"
            ;;
        *)
            print_error "Unsupported OS for automatic FFmpeg installation"
            exit 1
            ;;
    esac
    
    if command_exists ffmpeg; then
        print_success "FFmpeg installed successfully"
        ffmpeg -version | head -1
    else
        print_error "FFmpeg installation failed"
        exit 1
    fi
}

# Install uv (Python package manager)
install_uv() {
    print_status "Checking for uv..."
    
    if command_exists uv; then
        print_success "uv already installed"
        uv --version
        return 0
    fi

    print_status "Installing uv..."
    
    case "$OS" in
        "macos"|"linux")
            curl -LsSf https://astral.sh/uv/install.sh | sh
            # Source the shell configuration to make uv available
            if [ -f "$HOME/.bashrc" ]; then
                source "$HOME/.bashrc"
            fi
            if [ -f "$HOME/.zshrc" ]; then
                source "$HOME/.zshrc"
            fi
            export PATH="$HOME/.cargo/bin:$PATH"
            ;;
        "windows")
            print_warning "Please install uv manually on Windows:"
            print_warning "Run: powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\""
            ;;
        *)
            print_error "Unsupported OS for automatic uv installation"
            exit 1
            ;;
    esac
    
    if command_exists uv; then
        print_success "uv installed successfully"
        uv --version
    else
        print_error "uv installation failed. You may need to restart your terminal."
        print_warning "Try running: source ~/.bashrc or source ~/.zshrc"
        exit 1
    fi
}

# Install Python dependencies
install_python_deps() {
    print_status "Installing Python dependencies..."
    
    if ! command_exists uv; then
        print_error "uv not found. Please ensure uv is properly installed."
        exit 1
    fi

    # Initialize uv project if pyproject.toml doesn't exist
    if [ ! -f "pyproject.toml" ]; then
        print_status "Initializing uv project..."
        uv init --no-readme
    fi

    # Add yt-dlp dependency
    print_status "Adding yt-dlp dependency..."
    uv add yt-dlp

    print_success "Python dependencies installed successfully"
}

# Create pyproject.toml if it doesn't exist
create_pyproject() {
    if [ ! -f "pyproject.toml" ]; then
        print_status "Creating pyproject.toml..."
        cat > pyproject.toml << 'EOF'
[project]
name = "youtube-downloader"
version = "1.0.0"
description = "A powerful YouTube video downloader with segment extraction"
dependencies = [
    "yt-dlp>=2024.1.1",
]
requires-python = ">=3.8"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
EOF
        print_success "pyproject.toml created"
    fi
}

# Verify installation
verify_installation() {
    print_status "Verifying installation..."
    
    local all_good=true
    
    # Check Python
    if command_exists python3; then
        print_success "Python: $(python3 --version)"
    else
        print_error "Python 3 not found"
        all_good=false
    fi
    
    # Check uv
    if command_exists uv; then
        print_success "uv: $(uv --version)"
    else
        print_error "uv not found"
        all_good=false
    fi
    
    # Check FFmpeg
    if command_exists ffmpeg; then
        print_success "FFmpeg: $(ffmpeg -version | head -1)"
    else
        print_error "FFmpeg not found"
        all_good=false
    fi
    
    # Check yt-dlp
    if uv run python -c "import yt_dlp; print(f'yt-dlp: {yt_dlp.version.__version__}')" 2>/dev/null; then
        print_success "yt-dlp: $(uv run python -c "import yt_dlp; print(yt_dlp.version.__version__)")"
    else
        print_error "yt-dlp not found or not working"
        all_good=false
    fi
    
    if [ "$all_good" = true ]; then
        print_success "All dependencies verified successfully!"
        return 0
    else
        print_error "Some dependencies are missing or not working"
        return 1
    fi
}

# Make ytd.py executable
setup_script() {
    if [ -f "ytd.py" ]; then
        print_status "Making ytd.py executable..."
        chmod +x ytd.py
        print_success "ytd.py is now executable"
    else
        print_warning "ytd.py not found in current directory"
    fi
}

# Main installation process
main() {
    print_status "Starting installation process..."
    
    detect_os
    
    # Create project structure
    create_pyproject
    
    # Install dependencies based on OS
    case "$OS" in
        "macos")
            install_homebrew
            install_ffmpeg
            install_uv
            ;;
        "linux")
            install_ffmpeg
            install_uv
            ;;
        "windows")
            print_warning "Windows detected. Some steps require manual installation."
            install_ffmpeg
            install_uv
            ;;
        *)
            print_error "Unsupported operating system: $OS"
            exit 1
            ;;
    esac
    
    # Install Python dependencies
    install_python_deps
    
    # Setup script
    setup_script
    
    echo ""
    print_status "Verifying installation..."
    if verify_installation; then
        echo ""
        print_success "🎉 Setup completed successfully!"
        echo ""
        print_status "You can now use the YouTube downloader:"
        echo "  uv run ytd.py \"https://youtube.com/watch?v=VIDEO_ID\" -o \"my_video\""
        echo ""
        print_status "For more usage examples, see the README.md file"
    else
        echo ""
        print_error "❌ Setup completed with errors. Please check the messages above."
        echo ""
        print_status "You may need to:"
        echo "  1. Restart your terminal"
        echo "  2. Run: source ~/.bashrc or source ~/.zshrc"
        echo "  3. Check that all tools are in your PATH"
        exit 1
    fi
}

# Cleanup function for interrupted installs
cleanup() {
    print_warning "Installation interrupted. Cleaning up..."
    exit 1
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Run main function
main "$@"