#!/usr/bin/env bash

set -e

if [ -f "$GOOGLE_SERVICES_JSON" ]; then
  echo "Copying google-services.json to android/app/"
  mkdir -p android/app
  cp "$GOOGLE_SERVICES_JSON" android/app/google-services.json
  echo "Done!"
else
  echo "ERROR: GOOGLE_SERVICES_JSON file not found!"
  exit 1
fi