#!/usr/bin/env bash

set -e

echo "Running post-checkout hook..."

if [ -n "$GOOGLE_SERVICES_JSON" ]; then
  echo "Creating google-services.json from environment variable..."
  
  # Create in project root (for app.json config)
  echo "$GOOGLE_SERVICES_JSON" | base64 -d > google-services.json
  
  echo "google-services.json created successfully!"
  ls -la google-services.json
else
  echo "ERROR: GOOGLE_SERVICES_JSON environment variable not found!"
  exit 1
fi