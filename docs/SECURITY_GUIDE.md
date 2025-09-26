# Security Configuration Guide

## Overview

This guide provides step-by-step instructions for securing your AI Memory MCP Server deployment. Following these recommendations is **critical** for production deployments.

### Why Security Matters

Your AI Memory MCP Server stores sensitive information including:

- Personal memories and thoughts
- Task management data
- Project information
- AI instructions that could influence behavior

Without proper security, this data could be:

- **Stolen** by unauthorized users
- **Modified** by malicious actors
- **Exposed** through data breaches
- **Used** to manipulate AI behavior

This guide will help you protect against these threats.

## 🔐 Authentication Setup

**What is Authentication?**
Authentication is like a password that proves you're allowed to access the server. Without it, anyone on the internet could read your memories, modify your tasks, or inject malicious AI instructions.

**Why API Keys?**
API keys are simpler and more secure than username/password for server-to-server communication. They're:

- **Unique**: Each key is different and hard to guess
- **Revocable**: You can disable a key without affecting others
- **Trackable**: You can see which key made which request

### 1. Generate API Key

```bash
# Generate a secure API key (64 random characters)
openssl rand -hex 32
```

**What this does**: Creates a random 64-character string that's virtually impossible to guess. This becomes your "password" for accessing the server.

### 2. Configure Environment

**If you don't have a .env file yet:**

```bash
# Copy the example environment file
cp env.example .env
```

**If you already have a .env file (SAFER):**

```bash
# Check what's in your current .env file
cat .env

# Add the API key to your existing .env file (no quotes needed)
echo "API_KEY=your-generated-api-key-here" >> .env
```

**Or manually edit your .env file:**

```bash
# Open your .env file in your preferred editor
nano .env
# or
code .env
# or
vim .env

# Add this line to your .env file (no quotes around the value):
API_KEY=your-generated-api-key-here
```

**What this does**: Stores your API key in a secure environment variable that the server can read, but isn't visible in your code.

### 3. Client Configuration

Update your MCP client configuration to include the API key:

**For Docker-based setup (your current configuration):**

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "docker",
      "args": ["exec", "-i", "ai-memory-server", "node", "dist/index.js"],
      "env": {
        "API_KEY": "your-generated-api-key-here"
      }
    }
  }
}
```

**For direct Node.js setup (if you switch later):**

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "node",
      "args": ["/path/to/ai-memory-mcp/dist/http-server.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/db",
        "API_KEY": "your-generated-api-key-here"
      }
    }
  }
}
```

**What this does**: Tells your MCP client (like Claude Desktop) to send the API key with every request, proving it's authorized to access your data. The Docker version passes the API key to the container, while the direct Node.js version includes both database and API key configuration.

## 🌐 HTTPS Configuration

**What is HTTPS?**
HTTPS encrypts all communication between your client and server. Without it, anyone monitoring your network (like on public WiFi) can see your API keys, memories, and all data being transmitted.

**Why HTTPS Matters:**

- **Encryption**: All data is scrambled so eavesdroppers can't read it
- **Authentication**: Proves you're talking to the real server, not an imposter
- **Integrity**: Ensures data hasn't been tampered with in transit

### 1. Generate SSL Certificates

SSL certificates are like digital IDs that prove your server is legitimate and enable encryption.

#### Using Let's Encrypt (Recommended for Production)

```bash
# Install certbot (free certificate authority)
sudo apt-get install certbot

# Generate certificate for your domain
sudo certbot certonly --standalone -d yourdomain.com
```

**What this does**: Gets a free, trusted SSL certificate from Let's Encrypt that browsers and clients will automatically trust. This is the gold standard for production.

#### Using Self-Signed Certificates (Local Development & Docker)

For local development (including Docker containers), you'll use self-signed certificates:

```bash
# Generate private key (2048-bit encryption)
openssl genrsa -out private-key.pem 2048

# Generate certificate (valid for 365 days)
# When prompted, you can use 'localhost' or your Docker container's IP
openssl req -new -x509 -key private-key.pem -out certificate.pem -days 365
```

**What this does**: Creates a certificate for testing. Browsers will show a security warning because it's not from a trusted authority, but you can safely click "Advanced" → "Proceed to localhost" for development.

**For Docker**: Place these certificates in your Docker container and mount them as volumes, or generate them inside the container.

### 2. Configure HTTPS

```bash
# Add to .env
USE_HTTPS=true
SSL_KEY_PATH=/path/to/private-key.pem
SSL_CERT_PATH=/path/to/certificate.pem
```

**What this does**: Tells the server to use HTTPS instead of HTTP, encrypting all communication and protecting your data from eavesdroppers.

### 3. Docker-Specific Setup

For Docker containers, you have a few options:

#### Option A: Generate certificates inside the container

```bash
# Run your container and generate certificates inside
docker exec -it your-container-name bash
openssl genrsa -out /app/private-key.pem 2048
openssl req -new -x509 -key /app/private-key.pem -out /app/certificate.pem -days 365
```

#### Option B: Mount certificates as volumes

```bash
# Generate certificates on your host machine
openssl genrsa -out ./certs/private-key.pem 2048
openssl req -new -x509 -key ./certs/private-key.pem -out ./certs/certificate.pem -days 365

# Mount them in your docker-compose.yml
volumes:
  - ./certs:/app/certs
```

#### Option C: Use Docker's built-in certificate generation

```yaml
# In your docker-compose.yml
services:
  ai-memory-mcp:
    # ... other config
    environment:
      - USE_HTTPS=true
      - SSL_KEY_PATH=/app/certs/private-key.pem
      - SSL_CERT_PATH=/app/certs/certificate.pem
    volumes:
      - ./certs:/app/certs
```

## 🛡️ CORS Configuration

**What is CORS?**
CORS (Cross-Origin Resource Sharing) controls which websites can make requests to your server. Without proper CORS settings, malicious websites could:

- Steal your API key
- Read your memories
- Modify your tasks
- Inject malicious AI instructions

**Why CORS Matters:**

- **Prevents CSRF attacks**: Stops malicious sites from making requests on your behalf
- **Controls access**: Only allows trusted websites to connect
- **Protects credentials**: Prevents unauthorized use of your API keys

### 1. Set Allowed Origins

```bash
# Add to .env - specify your actual domains
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

**What this does**: Only allows requests from the websites you specify. Any other website trying to access your server will be blocked.

### 2. Development vs Production

```bash
# Development (allow local testing)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Production (only your real websites)
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

**What this does**:

- **Development**: Allows local testing from your development server
- **Production**: Only allows your actual production websites to connect

## 🚦 Rate Limiting

**What is Rate Limiting?**
Rate limiting prevents abuse by limiting how many requests can be made in a given time period. Without it, attackers could:

- **Overwhelm your server**: Send thousands of requests to crash it
- **Exhaust resources**: Use up all your database connections
- **Cost money**: If you're paying for server resources
- **Steal data**: Make many requests to extract all your information

**Why Rate Limiting Matters:**

- **Prevents DoS attacks**: Stops attempts to crash your server
- **Protects resources**: Ensures fair usage for all users
- **Reduces costs**: Prevents runaway usage that could be expensive
- **Maintains performance**: Keeps your server responsive

### 1. Configure Rate Limits

```bash
# Add to .env
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes (in milliseconds)
RATE_LIMIT_MAX_REQUESTS=100  # 100 requests per window
```

**What this does**: Allows 100 requests every 15 minutes. If someone tries to make more requests, they'll be blocked until the time window resets.

### 2. Adjust for Your Use Case

- **High-traffic applications**: Increase `RATE_LIMIT_MAX_REQUESTS` (e.g., 500-1000)
- **Sensitive applications**: Decrease `RATE_LIMIT_MAX_REQUESTS` (e.g., 20-50)
- **API endpoints**: Use stricter limits than web endpoints (e.g., 50 vs 100)

**Examples:**

- **Personal use**: 50 requests per 15 minutes
- **Small team**: 200 requests per 15 minutes
- **Public API**: 1000 requests per 15 minutes

## 🔒 Database Security

**What is Database Security?**
Your database contains all your memories, tasks, and AI instructions. Database security protects this data from:

- **Unauthorized access**: People who shouldn't see your data
- **Data theft**: Stealing your personal information
- **Data corruption**: Malicious modification of your data
- **SQL injection**: Code injection attacks through malicious queries

**Why Database Security Matters:**

- **Protects personal data**: Your memories and thoughts are private
- **Prevents data loss**: Ensures your data isn't corrupted or deleted
- **Maintains integrity**: Keeps your AI instructions from being tampered with
- **Compliance**: Meets privacy regulations and best practices

### 1. Use Strong Passwords

```bash
# Generate secure database password (32 random characters)
openssl rand -base64 32

# Update DATABASE_URL with the generated password
DATABASE_URL="postgresql://username:secure-password@localhost:5432/database"
```

**What this does**: Creates a password that's virtually impossible to guess, protecting your database from brute force attacks.

### 2. Enable SSL for Database

```bash
# Add SSL parameters to DATABASE_URL
DATABASE_URL="postgresql://username:password@localhost:5432/database?sslmode=require"
```

**What this does**: Encrypts all communication between your server and database, preventing eavesdroppers from seeing your data in transit.

### 3. Database Access Controls

```sql
-- Create dedicated user with limited privileges
CREATE USER ai_memory_user WITH PASSWORD 'secure-password';
GRANT CONNECT ON DATABASE ai_memory_db TO ai_memory_user;
GRANT USAGE ON SCHEMA public TO ai_memory_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_memory_user;
```

**What this does**: Creates a database user that can only:

- **Connect** to your specific database
- **Read and write** data (SELECT, INSERT, UPDATE, DELETE)
- **Cannot** create or drop tables (prevents accidental data loss)
- **Cannot** access other databases (prevents data leakage)

## 📊 Monitoring and Logging

**What is Security Monitoring?**
Security monitoring helps you detect and respond to threats by tracking:

- **Who** is accessing your server
- **When** they're accessing it
- **What** they're trying to do
- **Whether** they're authorized

**Why Monitoring Matters:**

- **Detects attacks**: See when someone is trying to break in
- **Identifies patterns**: Notice unusual access patterns
- **Provides evidence**: Have records if something goes wrong
- **Enables response**: Take action when threats are detected

### 1. Configure Logging

```bash
# Add to .env
LOG_LEVEL=info
LOG_FILE=/app/logs/server.log
```

**What this does**: Records all server activity to a log file, including:

- **Successful requests**: Who accessed what and when
- **Failed attempts**: Authentication failures and errors
- **Security events**: Rate limiting, CORS violations, etc.

### 2. Set Up Log Rotation

```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/ai-memory-mcp

# Add:
/app/logs/server.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 app app
}
```

**What this does**: Automatically manages log files by:

- **Daily rotation**: Creates new log file each day
- **30-day retention**: Keeps 30 days of logs
- **Compression**: Saves disk space by compressing old logs
- **Prevents disk full**: Stops logs from filling up your disk

### 3. Monitor Security Events

```bash
# Monitor authentication failures
grep "Unauthorized" /app/logs/server.log

# Monitor rate limit violations
grep "Rate limit exceeded" /app/logs/server.log
```

**What this does**: Helps you detect attacks by showing:

- **Failed login attempts**: Someone trying to guess your API key
- **Rate limit violations**: Someone trying to overwhelm your server
- **Suspicious patterns**: Unusual access times or locations

## 🐳 Docker Security

**What is Docker Security?**
Docker containers can be security risks if not configured properly. Docker security protects against:

- **Container escapes**: Breaking out of the container to access the host
- **Privilege escalation**: Gaining root access to the host system
- **Resource exhaustion**: Using up all system resources
- **Data exposure**: Accessing files outside the container

**Why Docker Security Matters:**

- **Isolates applications**: Prevents one app from affecting others
- **Limits damage**: Contains security breaches to the container
- **Controls access**: Restricts what the container can do
- **Protects host**: Keeps the host system safe from container compromises

### 1. Secure Docker Configuration

```yaml
# docker-compose.yml
version: '3.8'
services:
  ai-memory-server:
    build: .
    environment:
      - API_KEY=${API_KEY}
      - DATABASE_URL=${DATABASE_URL}
    ports:
      - '3000:3000'
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    # Security options
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
```

**What this does**: Implements multiple security layers:

- **no-new-privileges**: Prevents the container from gaining root privileges
- **read_only**: Makes the container filesystem read-only (prevents malicious writes)
- **tmpfs**: Provides temporary writable space only where needed
- **restart**: Automatically restarts if the container crashes

### 2. Use Non-Root User

```dockerfile
# Add to Dockerfile
RUN adduser --disabled-password --gecos '' appuser
USER appuser
```

**What this does**: Runs the application as a regular user instead of root, which:

- **Limits damage**: If compromised, attacker can't access system files
- **Follows principle of least privilege**: Only gives necessary permissions
- **Prevents privilege escalation**: Can't gain root access even if exploited

## 🔍 Security Testing

**What is Security Testing?**
Security testing verifies that your security measures actually work by simulating attacks and checking that they're properly blocked. This helps you:

- **Verify protection**: Make sure your security measures work
- **Find weaknesses**: Discover gaps in your security
- **Test responses**: Ensure proper error handling
- **Build confidence**: Know your system is secure

**Why Security Testing Matters:**

- **Prevents false security**: Just having security code doesn't mean it works
- **Finds vulnerabilities**: Discovers issues before attackers do
- **Validates configuration**: Ensures settings are correct
- **Tests edge cases**: Finds unexpected ways things can break

### 1. Test Authentication

```bash
# Test without API key (should fail with 401 Unauthorized)
curl -X GET http://localhost:3000/api/memory/list

# Test with API key (should succeed with 200 OK)
curl -X GET http://localhost:3000/api/memory/list \
  -H "X-API-Key: your-api-key"
```

**What this tests**: Verifies that:

- **Unauthorized requests are blocked**: No API key = no access
- **Authorized requests work**: Valid API key = access granted
- **Error messages are appropriate**: Clear feedback without exposing internals

### 2. Test Rate Limiting

```bash
# Test rate limiting (should start failing after 100 requests)
for i in {1..110}; do
  curl -X GET http://localhost:3000/api/memory/list \
    -H "X-API-Key: your-api-key"
done
```

**What this tests**: Verifies that:

- **Normal usage works**: First 100 requests succeed
- **Abuse is blocked**: Requests 101+ are rejected
- **Rate limiting resets**: After 15 minutes, requests work again

### 3. Test CORS

```bash
# Test CORS from unauthorized origin (should fail)
curl -X GET http://localhost:3000/api/memory/list \
  -H "Origin: https://malicious-site.com" \
  -H "X-API-Key: your-api-key"
```

**What this tests**: Verifies that:

- **Unauthorized origins are blocked**: Malicious sites can't access your API
- **Authorized origins work**: Your legitimate sites can access the API
- **CORS headers are correct**: Proper headers are sent in responses

## 🚨 Security Checklist

### Before Production Deployment

- [ ] **API Key**: Set strong, unique API key
- [ ] **HTTPS**: Enable HTTPS with valid certificates
- [ ] **CORS**: Configure restrictive CORS policy
- [ ] **Rate Limiting**: Enable appropriate rate limits
- [ ] **Database**: Use strong passwords and SSL
- [ ] **Logging**: Configure secure logging
- [ ] **Monitoring**: Set up security monitoring
- [ ] **Updates**: Keep dependencies updated
- [ ] **Backups**: Implement secure backup strategy
- [ ] **Testing**: Conduct security testing

### Regular Security Maintenance

- [ ] **Weekly**: Review logs for suspicious activity
- [ ] **Monthly**: Update dependencies
- [ ] **Quarterly**: Rotate API keys
- [ ] **Annually**: Renew SSL certificates
- [ ] **Ongoing**: Monitor security advisories

## 🆘 Incident Response

### 1. Security Incident Checklist

```bash
# 1. Isolate the system
docker-compose down

# 2. Preserve logs
cp -r logs/ incident-logs-$(date +%Y%m%d)

# 3. Rotate API keys
# Generate new API key and update configuration

# 4. Review access logs
grep "Unauthorized" logs/server.log
grep "Rate limit exceeded" logs/server.log

# 5. Update security measures
# Review and strengthen security configuration
```

### 2. Emergency Contacts

- **Security Team**: security@yourcompany.com
- **System Administrator**: admin@yourcompany.com
- **Incident Response**: incident@yourcompany.com

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

## ⚠️ Important Notes

1. **Never commit API keys or certificates to version control**
2. **Use environment variables for all sensitive configuration**
3. **Regularly update dependencies to patch security vulnerabilities**
4. **Monitor logs for suspicious activity**
5. **Test security measures before production deployment**

## 🎯 Security Strategy Overview

**The Defense-in-Depth Approach**

Your AI Memory MCP Server now implements multiple layers of security:

1. **Authentication Layer**: API keys prevent unauthorized access
2. **Network Layer**: HTTPS encrypts all communication
3. **Application Layer**: Input validation and sanitization
4. **Database Layer**: Strong passwords and SSL encryption
5. **Infrastructure Layer**: Docker security and monitoring
6. **Monitoring Layer**: Logging and alerting for threats

**How These Layers Work Together:**

```
┌─────────────────────────────────────────────────────────────┐
│                    ATTACKER                                │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│ 1. CORS Protection    │ Blocks malicious websites          │
├──────────────────────┼──────────────────────────────────────┤
│ 2. Rate Limiting     │ Prevents DoS attacks               │
├──────────────────────┼──────────────────────────────────────┤
│ 3. Authentication    │ Requires valid API key             │
├──────────────────────┼──────────────────────────────────────┤
│ 4. Input Validation  │ Sanitizes malicious input          │
├──────────────────────┼──────────────────────────────────────┤
│ 5. HTTPS Encryption  │ Protects data in transit           │
├──────────────────────┼──────────────────────────────────────┤
│ 6. Database Security │ Protects data at rest              │
├──────────────────────┼──────────────────────────────────────┤
│ 7. Monitoring        │ Detects and logs threats           │
└──────────────────────┴──────────────────────────────────────┘
```

**What This Means for You:**

- **Your data is protected** at every layer
- **Attacks are detected** and logged
- **Multiple barriers** must be overcome to compromise your system
- **Even if one layer fails**, others provide protection

Remember: Security is an ongoing process, not a one-time setup. Regular reviews and updates are essential for maintaining a secure deployment.
