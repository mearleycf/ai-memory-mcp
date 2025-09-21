#!/bin/bash
cd ~/code/mcp_servers/ai-memory-mcp
npm run build
echo "Build completed. Checking for syntax errors..."
node -c dist/index-with-context-tools.js
if [ $? -eq 0 ]; then
  echo "✅ Server build successful - no syntax errors!"
else
  echo "❌ Syntax errors still present"
fi