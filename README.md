# HavenDesk — 24/7 Autonomous AI Receptionist SaaS Platform

> **The turn-key, multi-tenant AI Receptionist platform for local service businesses (Roofing, Dental, HVAC, Plumbing, and more).**
> Captures 100% of customer inquiries across **Phone (Voice AI)**, **WhatsApp**, and **Website Chat** with sub-second response times, intelligent emergency triage, automated damage photo intake, and instant calendar booking.

---

## ⚡ Quick Start (Start in 10 Seconds)

You do **not** need to be a programmer to run HavenDesk. Everything runs out of the box in **Test Mode** with zero external keys required.

### Option 1: Run with One Command (Node.js)
Open your terminal in the `ai-receptionist` folder and run:
```bash
npm start
```
*(Or `bun start` if you prefer Bun)*.

### Option 2: Run with Docker (Recommended for Servers)
```bash
docker compose up -d
```

---

## 🌐 URLs & Where to Go

Once started, open these links in your web browser:

| Application | URL | Who It Is For |
| :--- | :--- | :--- |
| **Client Portal** | [http://localhost:3000/app](http://localhost:3000/app) | What your paying business clients see (roofers, dentists, etc.) |
| **Management Console** | [http://localhost:3000/admin](http://localhost:3000/admin) | What **you** and your team see to manage clients, plans, and AI prompts |
| **Website Widget Demo** | [http://localhost:3000/app/#/integrations](http://localhost:3000/app/#/integrations) | Interactive 24/7 web receptionist embed test |
| **System Health API** | [http://localhost:3000/api/health](http://localhost:3000/api/health) | Uptime and status check |

---

## 🔑 Default Login Credentials

The database comes pre-seeded with 3 realistic demo clients and full administrative access:

### 1. Management Console (You / Super Admin)
- **URL**: `http://localhost:3000/admin`
- **Email**: `admin@havendesk.com`
- **Password**: `HavenAdmin2026!`
- **Two-Factor Authentication (2FA TOTP)**: Enter `123456`

### 2. Demo Client 1: Vanguard Roofing (Growth Plan — Active)
- **URL**: `http://localhost:3000/app`
- **Email**: `owner@vanguardroofing.com`
- **Password**: `ClientPass2026!`
- *(Or click the **"Vanguard Roofing"** quick-demo pill on the login screen)*

### 3. Demo Client 2: Apex Emergency Dental (Pro Plan — Active)
- **Email**: `drdavis@apexdental.com`
- **Password**: `ClientPass2026!`
- *(Or click the **"Apex Dental"** quick-demo pill on the login screen)*

### 4. Demo Client 3: Apex Climate HVAC (Starter Plan — Trialing)
- **Email**: `marcus@apexclimate.com`
- **Password**: `ClientPass2026!`
- *(Or click the **"Apex Climate"** quick-demo pill on the login screen)*

---

## 🎬 Client Demo Video (Ready to Show Prospects)

A ready-to-present, 1080p Full HD client demo video with natural voiceover narration and background music is ready to share with prospective business clients:

- **File Location**: `demo-video/output/havendesk_client_demo.mp4`
- **Resolution**: 1920x1080 Full HD (MP4)
- **Duration**: ~85 seconds
- **Story Arc**:
  1. **The Hook**: 62% of calls after 5 PM go to voicemail; $8,500+ lost per missed emergency inquiry.
  2. **The Solution**: HavenDesk answers in sub-800ms across Phone, WhatsApp, and Web.
  3. **Live Process**: Saturday 8:45 PM severe storm ceiling leak emergency triage & damage photo collection.
  4. **The Owner's Dashboard**: 8:00 AM daily briefing, unified CRM, and hours saved.
  5. **Call to Action**: 14-day free trial, live in under 5 minutes.

To re-render or customize the video at any time:
```bash
npm run generate-demo
```

---

## 💼 How-To Guide for Business Owners

### 1. How to Add a New Client
1. Log in to the Management Console at `http://localhost:3000/admin`.
2. Click **Clients** in the left sidebar.
3. Click the **+ New Client** button in the top right.
4. Enter the business name, owner's email, niche (Roofing, Dental, HVAC, etc.), and select their initial subscription plan.
5. Click **Create Client**. The system will automatically provision their account, database records, and unique website widget key.

### 2. How to "View as Client" (Impersonation)
1. In the Management Console, go to **Clients**.
2. Click on any client to open their details.
3. Click the **View as Client** button.
4. The client's portal will open instantly with a clear administrative banner at the top. When you are done, click **Exit to Admin Console** in the banner.

### 3. How to Change Pricing Plans
1. In the Management Console, click **Plans & Pricing**.
2. You can view or adjust the monthly price, included voice minutes, included messages, and overage rates for **Starter ($199/mo)**, **Growth ($399/mo)**, and **Pro ($799/mo)**.
3. Changes apply instantly to new signups and checkout sessions.

### 4. How to Customize the AI's Prompts or Voice
- **Globally for all clients**: Go to `http://localhost:3000/admin` &rarr; **AI & Prompts**. You can adjust the core instruction prompt, select the model (e.g. GPT-4o-mini, Gemini, Groq), and rollback to previous prompt versions with one click.
- **For a specific client**: Either impersonate them or log in as them &rarr; Go to **Receptionist Rules** &rarr; Change their greeting, voice persona, emergency keywords, and services.

### 5. How to Embed the Receptionist on a Website
1. Log in to the Client Portal &rarr; Go to **Channels & Widget**.
2. Copy the one-line embed code:
   ```html
   <script src="https://yourdomain.com/widget.js" data-haven-key="pk_live_your_client_key"></script>
   ```
3. Paste that script tag right before the closing `</body>` tag of their WordPress, Squarespace, Wix, or custom website.

---

## 📋 Third-Party Accounts Checklist (Going Live in Production)

When you are ready to transition from Test Mode to taking real live phone calls and processing real credit cards, here is the exact list of accounts and keys you will need.

> [!NOTE]
> None of these are required to run the demo or test locally. Every provider has test keys or free tiers so you can set them up with zero upfront cost.

### Group 1: Essential (Required to launch your SaaS)

| Account & Website | What It Is Used For | Keys Needed in `.env` | Cost / Free Tier |
| :--- | :--- | :--- | :--- |
| **Stripe**<br>[stripe.com](https://stripe.com) | Credit card payments, recurring monthly subscriptions, customer billing portal. | `STRIPE_SECRET_KEY`<br>`STRIPE_PUBLISHABLE_KEY`<br>`STRIPE_WEBHOOK_SECRET` | Free to create. Pay-as-you-go (2.9% + 30¢ per successful transaction). Free test mode included. |
| **VPS Server**<br>e.g. [digitalocean.com](https://digitalocean.com) or [hetzner.com](https://hetzner.com) | Live cloud server to host HavenDesk 24/7 on the internet. | Server IP address (no key needed). | ~$5.00 to $10.00 / month. |
| **Domain Name**<br>e.g. [cloudflare.com](https://cloudflare.com) or [namecheap.com](https://namecheap.com) | Your custom website address (e.g., `havendesk.com`). | DNS records pointing to your server. | ~$10.00 / year. |

### Group 2: Recommended (For live phone numbers & WhatsApp)

| Account & Website | What It Is Used For | Keys Needed in `.env` | Cost / Free Tier |
| :--- | :--- | :--- | :--- |
| **Twilio**<br>[twilio.com](https://twilio.com) | Buying local phone numbers for clients, incoming voice calls, and WhatsApp Business API messaging. | `TWILIO_ACCOUNT_SID`<br>`TWILIO_AUTH_TOKEN`<br>`TWILIO_PHONE_NUMBER`<br>`TWILIO_WHATSAPP_NUMBER` | Free trial credit included. Phone numbers ~$1.15/mo, voice ~$0.014/min, WhatsApp ~$0.005/msg. |
| **Vapi** or **Retell AI**<br>[vapi.ai](https://vapi.ai) / [retellai.com](https://retellai.com) | Ultra-low latency voice AI pipeline (human-like conversational voice on phone calls). | `VAPI_API_KEY`<br>`VAPI_ASSISTANT_ID` *(or `RETELL_API_KEY`)* | Free trial credits included ($10 free on signup). ~$0.05 to $0.09 / min for conversational voice. |
| **OpenAI** or **Groq**<br>[platform.openai.com](https://platform.openai.com) / [groq.com](https://groq.com) | Advanced LLM reasoning for complex caller questions and knowledgebase lookup. | `OPENAI_API_KEY`<br>`GROQ_API_KEY` | Pay-as-you-go. GPT-4o-mini is ~$0.15 per million tokens (cents per month). Groq offers a generous free tier. |

### Group 3: Optional (Nice to have later)

| Account & Website | What It Is Used For | Keys Needed in `.env` | Cost / Free Tier |
| :--- | :--- | :--- | :--- |
| **Google Cloud Console**<br>[console.cloud.google.com](https://console.cloud.google.com) | Direct two-way sync with clients' Google Calendars. | `GOOGLE_CALENDAR_ID` | Free. |
| **Cal.com**<br>[cal.com](https://cal.com) | Alternative booking engine with automated SMS reminders. | `CALCOM_API_KEY` | Free tier available. |
| **Meta for Developers**<br>[developers.facebook.com](https://developers.facebook.com) | Direct Meta WhatsApp Cloud API (if not using Twilio for WhatsApp). | `META_WHATSAPP_TOKEN`<br>`META_PHONE_NUMBER_ID` | First 1,000 conversations each month are free. |

---

## 🛠️ Troubleshooting FAQ

#### Q: How do I reset the database to a fresh state?
**A**: Simply run:
```bash
npm run seed
```
This resets all tables and re-seeds the 3 demo businesses, super admin, and plans.

#### Q: The server won't start because port 3000 is in use.
**A**: You can change the port by setting `PORT=3001` in your `.env` file, or stop the conflicting application.

#### Q: Can I run this on my iPhone or Android as an app?
**A**: Yes! Open `http://your-server-ip:3000/app` in Safari (iOS) or Chrome (Android), tap the share/menu button, and select **"Add to Home Screen"**. The app will install as a standalone mobile application with an offline cache.

#### Q: Where are the tests?
**A**: Run `npm test` anytime. It executes 100% automated tests verifying multi-tenant isolation, cryptographic security, rate limiting, and subscription lockout.

---

## 🔒 Security & Architecture
For deep architectural details, encryption mechanisms (AES-256-GCM), and multi-tenant isolation guarantees, please refer to:
- [`SECURITY.md`](SECURITY.md) — Security whitepaper and compliance checklist.
- [`DEPLOY.md`](DEPLOY.md) — Production VPS and Docker deployment guide.
