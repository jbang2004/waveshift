#!/bin/bash

# WaveShift Frontend - Wrangler Secrets Setup Script
# This script helps configure production secrets for Cloudflare Workers

echo "🔐 Setting up Wrangler Secrets for WaveShift Frontend"
echo "=================================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "   npm install -g wrangler"
    exit 1
fi

echo "📋 Required secrets for production deployment:"
echo ""

# R2 Access Key ID
echo "1. Setting R2_ACCESS_KEY_ID..."
echo "   This is your Cloudflare R2 access key ID"
echo "   Current development value: edd17237d9d959330bee4958000c3598"
read -p "   Enter production R2_ACCESS_KEY_ID (or press Enter to use dev value): " r2_access_key
if [ -z "$r2_access_key" ]; then
    r2_access_key="edd17237d9d959330bee4958000c3598"
fi
echo "$r2_access_key" | wrangler secret put R2_ACCESS_KEY_ID

echo ""

# R2 Secret Access Key
echo "2. Setting R2_SECRET_ACCESS_KEY..."
echo "   This is your Cloudflare R2 secret access key"
echo "   Current development value: 37acd15528b06e4d09055cbec8b2380f1bb30a7b057c0b880815d5579eb1ef4a"
read -p "   Enter production R2_SECRET_ACCESS_KEY (or press Enter to use dev value): " r2_secret_key
if [ -z "$r2_secret_key" ]; then
    r2_secret_key="37acd15528b06e4d09055cbec8b2380f1bb30a7b057c0b880815d5579eb1ef4a"
fi
echo "$r2_secret_key" | wrangler secret put R2_SECRET_ACCESS_KEY

echo ""

# Workflow Callback Secret
echo "3. Setting WORKFLOW_CALLBACK_SECRET..."
echo "   This is used for secure communication between workflow and frontend"
echo "   Current development value: waveshift-callback-secret-2025"
read -p "   Enter production WORKFLOW_CALLBACK_SECRET (or press Enter to use dev value): " callback_secret
if [ -z "$callback_secret" ]; then
    callback_secret="waveshift-callback-secret-2025"
fi
echo "$callback_secret" | wrangler secret put WORKFLOW_CALLBACK_SECRET

echo ""

# JWT Secret
echo "4. Setting JWT_SECRET..."
echo "   This is used for JWT token signing and verification"
echo "   Current development value: WmFPWSN8OzBcMbGd2XvF+IHy7d/f/CtgJ5+K1ug8FCo="
read -p "   Enter production JWT_SECRET (or press Enter to generate new): " jwt_secret
if [ -z "$jwt_secret" ]; then
    # Generate a new 256-bit base64 encoded secret
    jwt_secret=$(openssl rand -base64 32)
    echo "   Generated new JWT secret: $jwt_secret"
fi
echo "$jwt_secret" | wrangler secret put JWT_SECRET

echo ""
echo "✅ All secrets have been configured successfully!"
echo ""
echo "📝 To verify your secrets, run:"
echo "   wrangler secret list"
echo ""
echo "🚀 You can now deploy with:"
echo "   npm run deploy"
echo ""
echo "⚠️  Important Security Notes:"
echo "   - Keep these secrets secure and never commit them to version control"
echo "   - Use different secrets for production and development environments"
echo "   - Rotate secrets regularly for enhanced security"
echo "   - Consider using Cloudflare Access for additional security layers"