#!/bin/bash

# Stop on any error
set -e

echo "Building RedVBlue game executable..."

# Create a build directory
mkdir -p dist

# Build the executable
bun build ./src/server/index.js --compile --outfile dist/redvblue

# Copy static assets
cp -r public dist/
cp -r src/client dist/src/

echo "Build complete! Executable is at dist/redvblue"
echo "To run: ./dist/redvblue"
