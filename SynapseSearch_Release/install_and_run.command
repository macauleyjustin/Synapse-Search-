#!/bin/bash

# Synapse Search - Auto Installer & Runner

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "      SYNAPSE SEARCH SETUP "
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

echo "Node.js found: $(node -v)"

# Check if node_modules exists, if not, install
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies... (This may take a moment)"
    npm install
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies."
        read -n 1
        exit 1
    fi
else
    echo "Dependencies already installed."
fi

# Open browser after a short delay
(sleep 2 && open "http://localhost:3000") &

# Start Server
echo "Starting Synapse Search..."
echo "Press Ctrl+C to stop the server."
echo "========================================"

npm start
