#!/bin/bash
# HomeWOD deploy script
# Usage: ./deploy.sh "your commit message"

set -e

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"your commit message\""
  exit 1
fi

echo "→ Staging and committing..."
git add .
git commit -m "$1"

echo "→ Pushing to GitHub..."
git push origin main

echo "→ Deploying to Vercel..."
DEPLOY_URL=$(vercel --prod 2>&1 | grep "Production:" | tail -1 | awk '{print $2}')
echo "  Deployed: $DEPLOY_URL"

echo "→ Aliasing domains..."
vercel alias set "$DEPLOY_URL" homewod.fit
vercel alias set "$DEPLOY_URL" www.homewod.fit

echo ""
echo "✓ Live at https://homewod.fit"
