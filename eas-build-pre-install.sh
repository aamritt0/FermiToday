#!/usr/bin/env bash

set -e

if [ -n "$GOOGLE_SERVICES_JSON" ]; then
  echo "Creating google-services.json from base64..."
  
  # Create in project root (for app.json config)
  echo "$GOOGLE_SERVICES_JSON" | base64 -d > google-services.json
  
  # Also create in android/app (for gradle)
  mkdir -p android/app
  echo "$GOOGLE_SERVICES_JSON" | base64 -d > android/app/google-services.json
  
  echo "google-services.json created in both locations!"
  ls -la google-services.json
  ls -la android/app/google-services.json
else
  echo "ERROR: GOOGLE_SERVICES_JSON not found!"
  exit 1
fi