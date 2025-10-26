#!/usr/bin/env bash

set -e

if [ -n "$GOOGLE_SERVICES_JSON" ]; then
  echo "Creating google-services.json from base64..."
  mkdir -p android/app
  echo "$GOOGLE_SERVICES_JSON" | base64 -d > android/app/google-services.json
  echo "Done!"
else
  echo "ERROR: GOOGLE_SERVICES_JSON not found!"
  exit 1
fi