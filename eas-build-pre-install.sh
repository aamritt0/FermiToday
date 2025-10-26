#!/usr/bin/env bash

if [ -n "$GOOGLE_SERVICES_JSON" ]; then
  echo "Creating google-services.json from environment variable"
  echo "$GOOGLE_SERVICES_JSON" | base64 --decode > android/app/google-services.json
fi