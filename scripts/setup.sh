#!/bin/bash

echo "🧠 AI Memory & Task Management MCP Server Setup"
echo "==============================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm found: $(npm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Build the project
echo "🔨 Building the project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Failed to build the project"
    exit 1
fi

# Get the absolute path to the built server
SERVER_PATH="$(pwd)/dist/index.js"

echo "✅ Build completed successfully!"
echo ""
echo "🔧 Configuration"
echo "=================="
echo "Add this configuration to your Claude Desktop config:"
echo ""
echo "macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "Windows: %APPDATA%/Claude/claude_desktop_config.json"
echo ""
echo "Configuration snippet:"
echo "{"
echo "  \"mcpServers\": {"
echo "    \"ai-memory\": {"
echo "      \"command\": \"node\","
echo "      \"args\": [\"$SERVER_PATH\"],"
echo "      \"env\": {}"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "📋 Next Steps:"
echo "1. Add the configuration above to your Claude Desktop config file"
echo "2. Restart Claude Desktop"
echo "3. The AI Memory tools should now be available in your conversations"
echo ""
echo "🎯 Usage Tips:"
echo "Memory Management:"
echo "- Store your preferences and context information first"
echo "- Use descriptive titles and categories"
echo "- Add relevant tags for easy searching"
echo "- Set priority levels (1-5) for important memories"
echo ""
echo "Task Management:"
echo "- Create tasks with clear titles and descriptions"
echo "- Set due dates and track project associations"
echo "- Use status updates to track progress"
echo "- Archive completed tasks to keep workspace clean"
echo ""
echo "📖 For detailed usage instructions, see README.md"
echo ""
echo "🎉 Setup complete! Happy memory building!"
