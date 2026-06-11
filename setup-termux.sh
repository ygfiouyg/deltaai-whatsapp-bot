#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# DeltaAI WhatsApp Bot v3 — Termux Setup Script
# ═══════════════════════════════════════════════════════════════════════════
# Run this script in Termux to install and start the bot!
# 
# Usage:
#   chmod +x setup-termux.sh
#   ./setup-termux.sh
#
# Or run directly:
#   bash setup-termux.sh
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DeltaAI WhatsApp Bot v3 — Termux Setup"
echo "  كود ربط بدون مسح QR — مجاني للأبد!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Update packages
echo "[1/5] Updating packages..."
pkg update -y && pkg upgrade -y

# Step 2: Install Node.js
echo "[2/5] Installing Node.js..."
pkg install nodejs -y

# Step 3: Verify Node.js
echo "[3/5] Checking Node.js version..."
node --version
npm --version

# Step 4: Install dependencies
echo "[4/5] Installing bot dependencies..."
cd "$(dirname "$0")"
npm install

# Step 5: Ask for phone number
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  هتحتاج تكتب رقم واتسابك (مع كود الدولة بدون +)"
echo "  مثال لمصر: 201234567890"
echo "═══════════════════════════════════════════════════════════════"
echo ""
read -p "رقم واتسابك: " PHONE

if [ -n "$PHONE" ]; then
  # Update .env file with phone number
  sed -i "s/^PHONE_NUMBER=.*/PHONE_NUMBER=$PHONE/" .env
  echo "Phone number saved!"
else
  echo "No phone number entered — will use QR code method instead"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Setup complete! Starting the bot..."
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Prevent phone from sleeping
termux-wake-lock 2>/dev/null

# Start the bot
node src/index.js
