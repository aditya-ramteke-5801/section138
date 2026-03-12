#!/usr/bin/env bash
# Render build script - installs dependencies and Puppeteer's Chromium
set -e

npm install

# Install system dependencies for Puppeteer on Render
# Render uses Ubuntu, so we need these libs
apt-get update -qq || true
apt-get install -y -qq \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libxshmfence1 \
  2>/dev/null || true
