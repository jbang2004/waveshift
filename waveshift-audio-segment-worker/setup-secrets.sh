#!/bin/bash

# Setup R2 secrets for Audio Segment Worker
# Usage: source this script or copy and run the commands

echo "Setting up R2 secrets for waveshift-audio-segment-worker..."
echo "Please have your R2 access credentials ready."
echo ""

# Prompt for R2 Access Key ID
echo -n "Enter R2_ACCESS_KEY_ID: "
read -r R2_ACCESS_KEY_ID
echo "$R2_ACCESS_KEY_ID" | npx wrangler secret put R2_ACCESS_KEY_ID

# Prompt for R2 Secret Access Key
echo -n "Enter R2_SECRET_ACCESS_KEY: "
read -rs R2_SECRET_ACCESS_KEY
echo ""
echo "$R2_SECRET_ACCESS_KEY" | npx wrangler secret put R2_SECRET_ACCESS_KEY

echo ""
echo "✅ Secrets configuration complete!"
echo ""
echo "To verify: npx wrangler secret list"