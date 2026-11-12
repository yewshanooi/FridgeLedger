# FridgeLedger Deployment Summary

This document explains what was deployed, how, and why each step was necessary.

---

## Architecture Overview

```
User's Browser
    → https://fridgeledgerapp.duckdns.org  (Next.js frontend, port 3000)
    → https://fridgeledger.duckdns.org     (FastAPI backend, port 8000)
    → https://api.telegram.org             (Telegram bot webhook)

All services run on a single AWS EC2 t2.micro instance (47.131.65.86)
nginx sits in front of both and handles HTTPS termination
```

---

## Phase 1 — Google Gemini Setup

### What we did
- Created a Google AI Studio API key
- Configured `GEMINI_API_KEY` in the environment
- Tested the Gemini connection with the receipt extraction endpoint
- Using model: `gemini-3.5-flash-lite`

### Why
Google Gemini via AI Studio provides managed vision-capable models for receipt OCR and structured extraction. The `google-genai` Python SDK handles authentication via API key and supports structured JSON output with Pydantic schemas.

The API key is stored in the `.env` file and loaded by the application at startup.

---

## Phase 2 — Vercel Deployment (Initial)

### What we did
- Deployed the FastAPI backend to Vercel as a separate project
- Deployed the Next.js frontend to Vercel as a separate project
- Created `backend/api/index.py` as the Vercel entry point for FastAPI
- Fixed CORS errors by setting `API_CORS_ORIGINS` in Vercel environment variables
- Fixed the analytics double-slash bug in `frontend/app/analytics/page.tsx`

### Why
**Vercel** is a hosting platform that deploys code directly from GitHub. It works well for Next.js (made by the same company) but runs Python as serverless functions.

**Serverless** means there is no persistent server — each request spins up a fresh process, handles the request, and shuts down. This caused two problems:
1. The Telegram session memory (`_sessions` dict) reset between requests
2. Vercel's 10-second timeout was too short for Gemini vision calls

This led us to migrate to EC2.

---

## Phase 3 — EC2 Setup

### What is EC2
EC2 (Elastic Compute Cloud) is a virtual machine on AWS. Unlike Vercel's serverless model, EC2 runs a real persistent server — it stays on 24/7, keeps memory between requests, and has no timeout limits.

### Step 1 — Launch EC2 Instance
- Chose **Ubuntu 22.04 LTS** as the operating system
- Chose **t2.micro** instance type (1 vCPU, 1GB RAM) — free tier eligible for 12 months
- Created a key pair (.pem file) for SSH access
- Opened ports 22 (SSH), 80 (HTTP), 443 (HTTPS) in the security group

**Why these ports:**
- Port 22: allows you to connect to the server via SSH
- Port 80: required for HTTP and for Let's Encrypt certificate verification
- Port 443: required for HTTPS (secure connections)

### Step 2 — Elastic IP
An Elastic IP is a static public IP address that stays the same even if you stop and restart the EC2 instance. Without it, the IP changes every restart, which would break the domain, the Telegram webhook, and all URLs.

Our Elastic IP: `47.131.65.86`

### Step 3 — Connect via EC2 Instance Connect
EC2 Instance Connect is a browser-based terminal provided by AWS. It lets you control the server without needing to manage SSH keys on your local machine.

---

## Phase 4 — Server Setup

### Installing dependencies
```bash
sudo apt update && sudo apt upgrade   # update package lists
sudo add-apt-repository ppa:deadsnakes/ppa  # add Python 3.11 source
sudo apt install python3.11 python3-venv python3-pip git nginx certbot python3-certbot-nginx
```

**Why each tool:**
- `python3` / `python3-venv`: run the FastAPI backend
- `git`: clone the code from GitHub
- `nginx`: web server that sits in front of the app (explained below)
- `certbot`: automatically gets and renews SSL certificates from Let's Encrypt

### Cloning the repository
```bash
git clone https://username:token@github.com/choongth/FridgeLedger.git
```
GitHub no longer accepts passwords — a Personal Access Token is required instead.

### Virtual environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
A virtual environment isolates Python packages for this project so they don't conflict with system packages.

### Installing Node.js and building the frontend
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install nodejs
npm install
npm run build
```
`npm run build` compiles the Next.js app into an optimised production bundle. After building, `npm start` serves it.

### Swap space
```bash
sudo fallocate -l 2G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```
The t2.micro only has 1GB RAM. The Next.js build process needs more, so we created a 2GB swap file — extra space on the disk used as overflow memory when RAM is full.

---

## Phase 5 — Running Services with systemd

### What is systemd
systemd is Ubuntu's service manager. It keeps processes running in the background, restarts them if they crash, and starts them automatically on boot.

### Backend service (`fridgeledger.service`)
Runs `uvicorn app.main:app` — the FastAPI server on port 8000.

### Frontend service (`fridgeledger-frontend.service`)
Runs `npm start` — the Next.js server on port 3000.

### Useful commands
```bash
sudo systemctl status fridgeledger           # check if running
sudo systemctl restart fridgeledger          # restart after code changes
sudo journalctl -u fridgeledger -f           # view live logs
```

---

## Phase 6 — nginx Reverse Proxy

### What is nginx
nginx is a web server that sits in front of your application. Instead of exposing port 8000 or 3000 directly to the internet, nginx listens on ports 80 and 443 and forwards requests to the correct service.

### Why nginx instead of exposing the app directly
1. **HTTPS**: nginx handles SSL certificates and encrypts traffic
2. **Security**: the app only listens on localhost (127.0.0.1), not the public internet
3. **Multiple services**: nginx can route different domains to different apps on the same server

### Our nginx configuration
```
https://fridgeledger.duckdns.org    →  nginx  →  FastAPI on port 8000
https://fridgeledgerapp.duckdns.org →  nginx  →  Next.js on port 3000
```

---

## Phase 7 — HTTPS with Let's Encrypt

### What is HTTPS
HTTPS encrypts traffic between the browser and the server. Without it:
- Passwords and data are sent in plain text
- Browsers show "Not Secure" warnings
- Telegram webhooks are rejected (Telegram requires HTTPS)

### Let's Encrypt
Let's Encrypt is a free, automated certificate authority. Certbot is the tool that:
1. Proves you own the domain (by temporarily serving a file nginx hosts)
2. Downloads and installs the SSL certificate
3. Sets up automatic renewal (certificates expire every 90 days)

---

## Phase 8 — DuckDNS (Free Domain)

### What is a domain and why we need one
An IP address like `47.131.65.86` works but:
- Hard to remember
- Let's Encrypt requires a domain name to issue a certificate
- Telegram webhooks need a valid HTTPS URL

DuckDNS provides free subdomains. We created:
- `fridgeledger.duckdns.org` → backend
- `fridgeledgerapp.duckdns.org` → frontend

Both point to the same EC2 IP (`47.131.65.86`). nginx distinguishes between them using the `server_name` directive.

---

## Phase 9 — Telegram Bot Webhook

### How Telegram bots work
A Telegram bot is a Telegram account managed by code. When a user sends a message to the bot, Telegram needs to know where to deliver it. We register a webhook URL:

```
https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://fridgeledger.duckdns.org/telegram/webhook
```

After this, Telegram automatically POSTs every incoming message to that URL. Our FastAPI endpoint at `/telegram/webhook` receives it, processes the receipt image through Gemini, and sends the reply back via the Telegram API.

**Why EC2 is better than Vercel for this:**
- EC2 keeps the `_sessions` dict in memory between requests, so the bot remembers the last scanned receipt when the user asks a follow-up question
- No 10-second timeout — Gemini vision calls can take several seconds

---

## Phase 10 — Updating the Deployment

When your team pushes new code to GitHub, update the server:

```bash
cd ~/FridgeLedger
git pull

# If backend changed:
cd backend
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart fridgeledger

# If frontend changed:
cd ~/FridgeLedger/frontend
npm install
npm run build
sudo systemctl restart fridgeledger-frontend
```

---

## Environment Variables

Environment variables are configuration values kept outside the code (never committed to GitHub). Each environment has its own copy:

| Location | File | Contains |
|---|---|---|
| Local machine | `.env` | Gemini API key, Supabase keys, model config |
| Local machine | `frontend/.env.local` | Supabase public URL, anon key, API URL |
| EC2 server | `~/FridgeLedger/.env` | Same as local `.env` + CORS origins |
| EC2 server | `~/FridgeLedger/frontend/.env.local` | EC2 backend URL instead of localhost |

---

## Cost Summary

| Service | Cost |
|---|---|
| EC2 t2.micro | Free for 12 months (then ~$9/month) |
| Elastic IP | Free while attached to a running instance |
| DuckDNS | Free |
| Let's Encrypt SSL | Free |
| Google Gemini (AI Studio) | Pay per request (free tier available, then usage-based) |
| Supabase | Free tier |

---

## Quick Reference

| What | URL |
|---|---|
| Frontend | https://fridgeledgerapp.duckdns.org |
| Backend API | https://fridgeledger.duckdns.org |
| API Docs | https://fridgeledger.duckdns.org/docs |
| Health Check | https://fridgeledger.duckdns.org/health |
| Telegram Bot | Search your bot username on Telegram |
