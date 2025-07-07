# 🧐 FinSage AI – Agentic Ledger Assistant

Welcome to **FinSage AI**, an intelligent agentic ledger assistant designed to simplify bookkeeping for small business owners and self-employed individuals. This system uses AI to interpret natural language inputs and automatically log financial transactions into structured Google Sheets.

> 📱 Input via Telegram | 🔍 Processed by Gemini AI | 📊 Stored in Google Sheets

---

## 🚀 Features

### 💬 AI-Powered Accounting

- Accepts **natural language inputs** via Telegram
- Uses **Gemini AI** to extract structured ledger data:
  - Date
  - Amount
  - Transaction Type (credit/debit)
  - Category
  - Notes

### 📲 Telegram Bot Interface

- Simple, chat-based user input
- Replies with entry confirmation and summaries

### 📄 Google Sheets Integration

- Structured ledger logging
- Automatically adds new entries in appropriate columns
- Option for multi-ledger (sheets per category)

### 🧠 Agentic AI Workflow

- Agent interprets, classifies, and routes messages
- Learns contextually for better data accuracy

---

## 💠 Tech Stack

- **Backend:** Node.js with Express
- **AI Processing:** Google Gemini Pro API
- **Bot Integration:** Telegram Bot API (`node-telegram-bot-api`)
- **Sheet Storage:** Google Sheets API
- **Auth (Optional for advanced use):** Telegram ID validation
- **Environment:** Nodemon for hot reloading

---

## 📋 Prerequisites

- Node.js (v14+)
- Google Cloud Project + Sheets API enabled
- Gemini API Key (from Google)
- Telegram Bot Token
- Google Sheet created with required columns

---

## ⚙️ Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd finsage-ai
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup `.env` File

```env
# Google Sheets
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY="your_private_key"

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Server
PORT=3000
```

- Download service-account-key.json file from google cloude console
- Add to project directory named as service-account-key.json
---

## 🚀 Running the Application

### Start the server

```bash
npm run dev
```

> Your Telegram bot should now be live and listening for messages.

---

## 📝 API Flow

### User Interaction Flow:

```
1. User sends message via Telegram:
   ➔ "Paid 1200 for groceries on July 5"

2. Bot forwards message to backend

3. Gemini AI processes the message:
   ➔ Extracts { amount: 1200, category: 'Groceries', date: '2025-07-05', type: 'debit' }

4. Bot writes entry into the Google Sheet ledger

5. User receives confirmation with extracted data
```

---

## 📊 Google Sheet Format

| Date       | Type  | Amount | Category  | Note               |
| ---------- | ----- | ------ | --------- | ------------------ |
| 2025-07-05 | Debit | ₹1200  | Groceries | Paid for groceries |

> You can customize columns or use multiple sheets for different ledgers.

---

## 🔄 Agent Workflow

1. **Telegram Message Received**
2. **Gemini AI Parsing Triggered**
3. **Structured Data Extracted**
4. **Data Appended to Google Sheet**
5. **Bot Confirms Entry with User**

---

## 🧪 Testing

To test the Telegram bot:

1. Start the server
2. Send a message like:
   ```
   Received ₹2000 from John for consulting
   ```
3. The bot should:
   - Reply with a structured summary
   - Add the entry to your Google Sheet

---

## 🔍 Troubleshooting

### 1. Google Sheets Not Updating?

- Check `GOOGLE_SHEET_ID` and credentials
- Ensure correct column headers exist in the sheet

### 2. Gemini AI Errors?

- Validate your API key
- Check rate limits
- Log the raw response for debugging

### 3. Telegram Bot Not Responding?

- Ensure bot is started (`/start`)
- Check that `TELEGRAM_BOT_TOKEN` is correct

---

## 📚 Dependencies

- `express`
- `node-telegram-bot-api`
- `googleapis`
- `axios`
- `dotenv`
- `nodemon`

---

## 🧠 Next Features (Post-MVP)

- Voice and image support
- Category learning and smart tagging
- `/summary` command for monthly reports
- Multi-user database for Telegram IDs
- Expense charts and analytics
- Export as PDF or CSV

---

## 🙏 Acknowledgments

- **Google Gemini** for powerful AI understanding
- **Telegram** for seamless user interaction
- **Google Sheets API** for simple, scalable storage

