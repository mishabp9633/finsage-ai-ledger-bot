// telegram-bot.js
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { nanoid } from "nanoid";

import { createLedgerByUser } from "../services/ledger.js";
import { connectDB } from "../db/dbconnection.js";
import Ledger from "../models/ledger.js";
import User from "../models/user.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
await connectDB();

//..................Google Sheets configuration.....................//
const GOOGLE_SHEETS_CONFIG = {
  keyFilename: "../service-account-key.json",
  keyFilename: path.join(__dirname, "../service-account-key.json"),
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
  // scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  // parentFolderId: 'your-google-drive-folder-id' // Optional: specify folder ID to organize sheets
};

// Initialize Google Sheets API
async function initializeGoogleSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_SHEETS_CONFIG.keyFilename,
    scopes: GOOGLE_SHEETS_CONFIG.scopes,
  });

  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const drive = google.drive({ version: "v3", auth: authClient });

  return { sheets, drive };
}

// Get bot token from environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ Please set TELEGRAM_BOT_TOKEN in your .env file");
  process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 300,       // time between polls (ms)
    params: 30,         // how long to wait for response (sec)
    autoStart: true,
  },
});

// Store user conversation states
const userStates = new Map();

console.log("🤖 Telegram bot is starting...");

//................GEMINI CONFIG................//
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ Please set GEMINI_API_KEY in your .env file");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Handle text messages
bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  const messageText = msg.text;
  const messageDate = new Date(msg.date * 1000);

  // Check if user is in a conversation state
  const userState = userStates.get(userId);

  // Handle ledger name input
  if (userState && userState.step === "waiting_for_ledger_name") {
    console.log(`\n📝 User ${username} entered ledger name: "${messageText}"`);

    // Store the ledger name
    userState.ledgerName = messageText;
    userState.step = "waiting_for_confirmation";
    userStates.set(userId, userState);

    // Ask for confirmation with inline keyboard
    const confirmationOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Yes, Create Ledger",
              callback_data: "confirm_ledger_yes",
            },
            { text: "❌ No, Cancel", callback_data: "confirm_ledger_no" },
          ],
        ],
      },
    };

    bot.sendMessage(
      chatId,
      `📋 Are you sure you want to create a ledger with this name?\n\n🏷️ Name: "${messageText}"\n\nPlease confirm:`,
      confirmationOptions
    );
    return;
  }

  // Handle entry text input
  if (userState && userState.step === "waiting_for_entry_text") {
    console.log(`\n📝 User ${username} entered entry text: "${messageText}"`);

    // Process the entry with Gemini AI
    bot.sendMessage(chatId, "🤖 Processing your entry with AI...");

    const geminiResult = await processEntryWithGemini(messageText);

    if (!geminiResult.isSuccess) {
      bot.sendMessage(
        chatId,
        `❌ Failed to process entry: ${geminiResult.message}\n\nPlease try again with a clearer entry.`
      );
      return;
    }

    const entryData = geminiResult.data;

    if (!entryData.isValid || entryData.confidence < 0.6) {
      bot.sendMessage(
        chatId,
        `⚠️ AI couldn't understand your entry clearly.\n\n🤖 Reasoning: ${entryData.reasoning}\n\nPlease try again with a clearer entry like:\n• "Paid 500 for materials"\n• "Received 1000 from client"\n• "Bought supplies for 250"`
      );
      return;
    }

    // Store the processed entry data
    userState.entryData = entryData;
    userState.step = "waiting_for_entry_confirmation";
    userStates.set(userId, userState);

    // Show confirmation message
    const confirmationMessage = `
🤖 AI processed your entry:

📅 Date: ${entryData.date}
🧾 Voucher: ${entryData.vchName} #${entryData.vchNumber}
📝 Description: ${entryData.description}
💰 Amount: ${
      entryData.debit > 0
        ? `₹${entryData.debit} (Debit)`
        : `₹${entryData.credit} (Credit)`
    }
👤 Party: ${entryData.partyName}

🤖 AI Confidence: ${Math.round(entryData.confidence * 100)}%
💭 Reasoning: ${entryData.reasoning}

Is this correct?`;

    const confirmationOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Yes, Add Entry",
              callback_data: "confirm_entry_yes",
            },
            { text: "❌ No, Cancel", callback_data: "confirm_entry_no" },
          ],
          [
            {
              text: "✏️ Edit Entry",
              callback_data: "edit_entry",
            },
          ],
        ],
      },
    };

    bot.sendMessage(chatId, confirmationMessage, confirmationOptions);
    return;
  }

  // Handle regular text messages (only if not in a conversation state)
  if (!userState) {
    console.log("\n📨 New Text Message Received:");
    console.log("─".repeat(40));
    console.log(`👤 From: ${username} (ID: ${userId})`);
    console.log(`💬 Chat ID: ${chatId}`);
    console.log(`📝 Message: "${messageText}"`);
    console.log(`⏰ Time: ${messageDate.toLocaleString()}`);
    console.log("─".repeat(40));

    // Check if message is a command
    if (messageText.startsWith("/")) {
      // If it's an unknown command, let the command handlers deal with it
      return;
    }

    // For non-command messages, show available commands
    console.log(
      `\n❓ User ${username} sent unrecognized message: "${messageText}"`
    );

    const commandsMessage = `🤖 I didn't understand that command.\n\n📋 Available Commands:\n\n🆕 /new_l - Create a new ledger\n📝 /new_e - Create a new ledger entry\n\n🔧 Other Commands:\n/start - Welcome message\n/help - Get help\n/status - Check bot status\n/cancel - Cancel current operation\n\n💡 Please use one of these commands to get started!`;

    bot.sendMessage(chatId, commandsMessage);
  }
});

// Handle photos
bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;

  console.log("\n📷 Photo Received:");
  console.log("─".repeat(40));
  console.log(`👤 From: ${username}`);
  console.log(`💬 Chat ID: ${chatId}`);
  console.log(`📸 Photo Caption: ${msg.caption || "No caption"}`);
  console.log("─".repeat(40));

  bot.sendMessage(chatId, `Thanks for the photo, ${username}! 📸`);
});

// Handle documents
bot.on("document", (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  const fileName = msg.document.file_name;

  console.log("\n📄 Document Received:");
  console.log("─".repeat(40));
  console.log(`👤 From: ${username}`);
  console.log(`💬 Chat ID: ${chatId}`);
  console.log(`📄 File Name: ${fileName}`);
  console.log("─".repeat(40));

  bot.sendMessage(
    chatId,
    `Thanks for the document "${fileName}", ${username}! 📄`
  );
});

// Handle bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;

  console.log(`\n🚀 /start command from ${username}`);

  const welcomeMessage = `Welcome ${username}! 🎉\n\nI'm your Personal Ledger Bot! 📊\n\n📋 What I can do:\n🆕 /new_l - Create a new ledger\n📝 /new_e - Create a new ledger entry\n\n🔧 Other Commands:\n/help - Get detailed help\n/status - Check bot status\n/cancel - Cancel current operation\n\n💡 Start by creating your first ledger with /new l`;

  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  console.log(
    `\n❓ /help command from ${msg.from.username || msg.from.first_name}`
  );

  const helpMessage = `🤖 Ledger Bot Help:\n\n📋 Main Commands:\n🆕 /new_l - Create a new ledger\n📝 /new_e - Create a new ledger entry\n\n🔧 Other Commands:\n/start - Welcome message\n/help - Show this help message\n/status - Check bot status\n/cancel - Cancel current operation\n\n💡 Tips:\n• Use /new l first to create your ledgers\n• Then use /new e to add entries to them\n• You can cancel any operation with /cancel`;

  bot.sendMessage(chatId, helpMessage);
});

//...........................new_l start..........................//

// Handle User commands
bot.onText(/\/new_l/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  console.log(`\n🚀 /new l command from ${username}`);

  // Set user state to waiting for ledger name
  userStates.set(userId, {
    step: "waiting_for_ledger_name",
    chatId: chatId,
    username: username,
  });

  bot.sendMessage(
    chatId,
    `📝 Please enter your ledger name:\n\nExample: "ABC Building Work Ledger" \n\nFor Cancel /cancel`
  );
});

// Handle callback queries (button presses)
bot.on("callback_query", async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || callbackQuery.from.first_name;
  const data = callbackQuery.data;

  console.log(`\n🔘 Button pressed by ${username}: ${data}`);

  const userState = userStates.get(userId);

  if (
    data === "confirm_ledger_yes" &&
    userState &&
    userState.step === "waiting_for_confirmation"
  ) {
    const ledgerName = userState.ledgerName;

    console.log(
      `\n✅ User ${username} confirmed ledger creation: "${ledgerName}"`
    );

    const ledgerData = {
      title: ledgerName,
      description: "",
      username,
    };

    try {
      // Create ledger in your database
      const response = await createLedgerByUser(ledgerData);

      if (response.isSuccess) {
        // Update message to show ledger creation progress
        bot.editMessageText(
          `✅ Ledger Created Successfully!\n\n🏷️ Name: "${
            response.data.title
          }"\n🆔 ID: ${
            response.data.id
          }\n👤 Created by: ${username}\n📅 Created at: ${new Date(
            response.data.createdAt
          ).toLocaleString()}\n\n📊 Creating Google Sheet...`,
          {
            chat_id: chatId,
            message_id: message.message_id,
          }
        );

        // Create Google Sheet
        const sheetData = {
          ...ledgerData,
          ledgerId: response.data.id,
          createdAt: response.data.createdAt,
        };

        const sheetResponse = await createLedgerSheet(sheetData);

        if (sheetResponse.isSuccess) {
          // Update message with Google Sheet success
          // bot.editMessageText(
          //   `✅ Ledger & Google Sheet Created Successfully!\n\n🏷️ Name: "${
          //     response.data.title
          //   }"\n🆔 ID: ${
          //     response.data.id
          //   }\n👤 Created by: ${username}\n📅 Created at: ${new Date(
          //     response.data.createdAt
          //   ).toLocaleString()}\n\n📊 Google Sheet: [Open Sheet](${
          //     sheetResponse.spreadsheetUrl
          //   })\n📋 Sheet ID: ${
          //     sheetResponse.spreadsheetId
          //   }\n\n🎉 Your ledger is ready to use!\n\n Add Your Enrty /new_e`,
          //   {
          //     chat_id: chatId,
          //     message_id: message.message_id,
          //     parse_mode: "Markdown",
          //     disable_web_page_preview: true,
          //   }
          // );

          bot.editMessageText(
            `✅ Ledger & Google Sheet Created Successfully!\n\n🏷️ Name: "${
              response.data.title
            }"\n🆔 ID: ${
              response.data.id
            }\n👤 Created by: ${username}\n📅 Created at: ${new Date(
              response.data.createdAt
            ).toLocaleString()}\n\n📊 Google Sheet: ${
              sheetResponse.spreadsheetUrl
            }\n📋 Sheet ID: ${
              sheetResponse.spreadsheetId
            }\n\n🎉 Your ledger is ready to use!\n\n Add Your Entry /new_e`,
            {
              chat_id: chatId,
              message_id: message.message_id,
              // Remove parse_mode: "Markdown"
              disable_web_page_preview: true,
            }
          );
          
          //Add Spreadsheet Id to Ledger model
          await Ledger.findByIdAndUpdate(response.data.id, {
            $set: {
              sheetId: sheetResponse.spreadsheetId,
            },
          });
        } else {
          // Ledger created but sheet failed
          bot.editMessageText(
            `⚠️ Ledger created but Google Sheet creation failed.\n\n✅ Ledger: "${response.data.title}" (ID: ${response.data.id})\n❌ Google Sheet: ${sheetResponse.message}\n\n💡 You can manually create the sheet later or try again.`,
            {
              chat_id: chatId,
              message_id: message.message_id,
            }
          );

          //Remove Ledger Created Without a Sheet
          Ledger.findByIdAndDelete(response.data.id);
        }
      } else {
        bot.editMessageText(
          `⚠️ Failed to create ledger.\n\n❌ Reason: ${response.message}`,
          {
            chat_id: chatId,
            message_id: message.message_id,
          }
        );
      }

      userStates.delete(userId);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: response.isSuccess
          ? "Ledger created successfully!"
          : "Ledger creation failed",
        show_alert: !response.isSuccess,
      });
    } catch (error) {
      console.error("Unexpected error during ledger creation:", error);

      bot.editMessageText(
        `🚨 Unexpected Error: Ledger creation failed due to a system issue.\n\nPlease try again or contact support.`,
        {
          chat_id: chatId,
          message_id: message.message_id,
        }
      );

      userStates.delete(userId);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Unexpected system error occurred.",
        show_alert: true,
      });
    }
  }
});

// Create a new Google Sheet for the ledger
async function createLedgerSheet(ledgerData) {
  try {
    const { sheets, drive } = await initializeGoogleSheets();

    console.log("sheets, drive", sheets, drive);
    // Create the spreadsheet
    const spreadsheetRequest = {
      resource: {
        properties: {
          title: `${ledgerData.title} - Ledger`,
          locale: "en_US",
          timeZone: "Asia/Kolkata", // Adjust timezone as needed
        },
        sheets: [
          {
            properties: {
              title: "Ledger",
              gridProperties: {
                rowCount: 1000,
                columnCount: 26,
              },
            },
          },
        ],
      },
    };

    const spreadsheet = await sheets.spreadsheets.create(spreadsheetRequest);
    const spreadsheetId = spreadsheet.data.spreadsheetId;
    const sheetId = spreadsheet.data.sheets[0].properties.sheetId;

    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: "writer",
        type: "anyone",
      },
    });

    console.log(`📊 Created Google Sheet: ${spreadsheetId}`);

    // Setup the ledger structure
    await setupLedgerStructure(sheets, spreadsheetId, sheetId, ledgerData);

    // Move to specified folder if configured
    if (GOOGLE_SHEETS_CONFIG.parentFolderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: GOOGLE_SHEETS_CONFIG.parentFolderId,
        removeParents: "root",
      });
    }

    return {
      isSuccess: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      message: "Ledger sheet created successfully",
    };
  } catch (error) {
    console.error("Error creating ledger sheet:", error);
    return {
      isSuccess: false,
      message: `Failed to create ledger sheet: ${error.message}`,
    };
  }
}

// Setup the ledger structure with headers, formatting, and colors
async function setupLedgerStructure(
  sheets,
  spreadsheetId,
  sheetId,
  ledgerData
) {
  const requests = [];

  // Define the headers and their structure
  const headers = [
    "Date",
    "VCh Name",
    "VCh Number",
    "Description",
    "Debit",
    "Credit",
    "Balance",
    "Party Name / Remarks",
  ];

  // Set up headers in row 1
  requests.push({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      rows: [
        {
          values: headers.map((header) => ({
            userEnteredValue: { stringValue: header },
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 }, // Blue header background
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 }, // White text
              },
              horizontalAlignment: "CENTER",
              borders: {
                top: { style: "SOLID", width: 1 },
                bottom: { style: "SOLID", width: 2 },
                left: { style: "SOLID", width: 1 },
                right: { style: "SOLID", width: 1 },
              },
            },
          })),
        },
      ],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Set column widths
  const columnWidths = [150, 200, 200, 350, 250, 250, 250, 250]; // Adjust as needed
  columnWidths.forEach((width, index) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: index,
          endIndex: index + 1,
        },
        properties: {
          pixelSize: width,
        },
        fields: "pixelSize",
      },
    });
  });

  // Freeze header row
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: {
          frozenRowCount: 1,
        },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Add title section above headers
  requests.push({
    insertDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: 0,
        endIndex: 3,
      },
    },
  });

  // Add ledger title
  requests.push({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: ledgerData.title },
              userEnteredFormat: {
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                textFormat: {
                  bold: true,
                  fontSize: 16,
                  foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
                },
                horizontalAlignment: "CENTER",
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Merge title cells
  requests.push({
    mergeCells: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      mergeType: "MERGE_ALL",
    },
  });

  // Add creation info
  requests.push({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      rows: [
        {
          values: [
            {
              userEnteredValue: {
                stringValue: `Created by: ${
                  ledgerData.username
                } | Created on: ${new Date().toLocaleString()}`,
              },
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                textFormat: {
                  fontSize: 10,
                  foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 },
                },
                horizontalAlignment: "CENTER",
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Merge creation info cells
  requests.push({
    mergeCells: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      mergeType: "MERGE_ALL",
    },
  });

  // Now update the header row (which is now row 4 due to inserted rows)
  requests.push({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: 3,
        endRowIndex: 4,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      rows: [
        {
          values: headers.map((header) => ({
            userEnteredValue: { stringValue: header },
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
              },
              horizontalAlignment: "CENTER",
              borders: {
                top: { style: "SOLID", width: 1 },
                bottom: { style: "SOLID", width: 2 },
                left: { style: "SOLID", width: 1 },
                right: { style: "SOLID", width: 1 },
              },
            },
          })),
        },
      ],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Update frozen row count to account for title rows
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: {
          frozenRowCount: 4,
        },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Add data validation for Date column (column A, starting from row 5)
  requests.push({
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: 4,
        endRowIndex: 1000,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      rule: {
        condition: {
          type: "DATE_IS_VALID",
        },
        showCustomUi: true,
        strict: true,
      },
    },
  });

  // Add data validation for Debit and Credit columns (numbers only)
  [2, 3].forEach((colIndex) => {
    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 4,
          endRowIndex: 1000,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1,
        },
        rule: {
          condition: {
            type: "NUMBER_GREATER_THAN_EQ",
            values: [{ userEnteredValue: "0" }],
          },
          showCustomUi: true,
          strict: true,
        },
      },
    });
  });

  // Execute all requests
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests },
  });

  console.log("✅ Ledger structure setup completed");
}

//...........................new_l end..........................//

//...........................new_e start..........................//

// Handle /new e command (new ledger entry)
bot.onText(/\/new_e/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  // Fetch ledgers created by the user
  const user = await User.findOne({ username });
  if (!user) {
    return bot.sendMessage(chatId, `❌ Could not find your account.`);
  }

  const ledgers = await Ledger.find({ createdBy: user._id }).sort({
    createdAt: -1,
  });

  if (ledgers.length === 0) {
    return bot.sendMessage(
      chatId,
      `📭 No ledgers found. Use /new_l to create one.`
    );
  }

  // Save ledger list in memory with pagination state
  userStates.set(userId, {
    step: "selecting_ledger_for_entry",
    page: 0,
    ledgers,
  });

  sendLedgerPage(chatId, userId, 0, ledgers);
});

function sendLedgerPage(chatId, userId, page, ledgers) {
  const pageSize = 5;
  const start = page * pageSize;
  const end = start + pageSize;
  const totalPages = Math.ceil(ledgers.length / pageSize);

  const pageLedgers = ledgers.slice(start, end);

  const inlineKeyboard = pageLedgers.map((ledger, index) => [
    {
      text: `📘 ${ledger.title}`,
      callback_data: `select_ledger:${ledger._id}`,
    },
  ]);

  const navButtons = [];

  if (page > 0) {
    navButtons.push({
      text: "⬅️ Prev",
      callback_data: `ledger_page:${page - 1}`,
    });
  }

  if (page < totalPages - 1) {
    navButtons.push({
      text: "Next ➡️",
      callback_data: `ledger_page:${page + 1}`,
    });
  }

  if (navButtons.length > 0) {
    inlineKeyboard.push(navButtons);
  }

  bot.sendMessage(
    chatId,
    `📚 Choose a ledger to add an entry:\n\nPage ${page + 1} of ${totalPages}\n\nFor Cancel /cancel`,
    {
      reply_markup: { inline_keyboard: inlineKeyboard },
    }
  );
}

// Function to process entry with Gemini AI
bot.on("callback_query", async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || callbackQuery.from.first_name;
  const data = callbackQuery.data;

  console.log(`\n🔘 Button pressed by ${username}: ${data}`);

  const userState = userStates.get(userId);

  // Handle ledger creation confirmation
  if (
    data === "confirm_ledger_yes" &&
    userState &&
    userState.step === "waiting_for_confirmation"
  ) {
    // ... (existing ledger creation code remains the same)
  }

  // Handle ledger creation cancellation
  if (data === "confirm_ledger_no") {
    userStates.delete(userId);
    bot.editMessageText("❌ Ledger creation cancelled.", {
      chat_id: chatId,
      message_id: message.message_id,
    });
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Cancelled",
    });
    return;
  }

  // Handle pagination for ledger selection
  if (data.startsWith("ledger_page:")) {
    const page = parseInt(data.split(":")[1], 10);
    if (userState && userState.ledgers) {
      userState.page = page;
      userStates.set(userId, userState);

      // Delete old message before sending new
      await bot.deleteMessage(chatId, message.message_id);
      sendLedgerPage(chatId, userId, page, userState.ledgers);
    }
    bot.answerCallbackQuery(callbackQuery.id);
    return;
  }

  if (!userState) {
    bot.sendMessage(
      chatId,
      `❌ Current operation cancelled.\n\nYou can start fresh with:\n🆕 /new_l - Create a new ledger\n📝 /new_e - Add a new entry`
    );
    return
  }

  // Handle ledger selection
  if (data.startsWith("select_ledger:")) {
    const ledgerId = data.split(":")[1];
    userState.selectedLedgerId = ledgerId;
    userState.step = "waiting_for_entry_text";
    userStates.set(userId, userState);

    bot.editMessageText(
      `✅ Ledger selected.\n\n📝 Now send your entry text:\n\nExamples:\n• "Paid 500 for materials"\n• "Received 1000 from client John"\n• "Bought office supplies for 250"\n• "Cash deposit 2000"\n\nFor Cancel /cancel`,
      {
        chat_id: chatId,
        message_id: message.message_id,
      }
    );
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Ledger selected",
    });
    return;
  }

  // Handle entry confirmation
  if (
    data === "confirm_entry_yes" &&
    userState &&
    userState.step === "waiting_for_entry_confirmation"
  ) {
    const ledgerId = userState.selectedLedgerId;
    const entryData = userState.entryData;

    try {
      // Get the ledger details
      const ledger = await Ledger.findById(ledgerId);
      if (!ledger) {
        throw new Error("Ledger not found");
      }

      // Update message to show processing
      bot.editMessageText(
        `✅ Entry confirmed!\n\n📊 Adding entry to Google Sheet...`,
        {
          chat_id: chatId,
          message_id: message.message_id,
        }
      );

      // Add entry to Google Sheet
      const sheetResult = await addEntryToSheet(ledger, entryData);

      if (sheetResult.isSuccess) {
        bot.editMessageText(
          `✅ Entry Added Successfully!\n\n📊 Ledger: ${
            ledger.title
          }\n📅 Date: ${entryData.date}\n📝 Description: ${
            entryData.description
          }\n💰 Amount: ${
            entryData.debit > 0
              ? `₹${entryData.debit} (Debit)`
              : `₹${entryData.credit} (Credit)`
          }\n💳 New Balance: ₹${
            sheetResult.data.newBalance
          }\n\n🎉 Entry has been added to your Google Sheet!\n\n For New Entry /new_e\n\n For New Ledger Create /new_l\n\n For Cancel /cancel`,
          {
            chat_id: chatId,
            message_id: message.message_id,
          }
        );
      } else {
        bot.editMessageText(
          `⚠️ Entry processed but failed to add to Google Sheet.\n\n❌ Error: ${sheetResult.message}\n\n💡 Please try again or check your sheet permissions.`,
          {
            chat_id: chatId,
            message_id: message.message_id,
          }
        );
      }

      userStates.delete(userId);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: sheetResult.isSuccess
          ? "Entry added successfully!"
          : "Failed to add entry",
        show_alert: !sheetResult.isSuccess,
      });
    } catch (error) {
      console.error("Error adding entry:", error);
      bot.editMessageText(
        `🚨 Error adding entry: ${error.message}\n\nPlease try again.`,
        {
          chat_id: chatId,
          message_id: message.message_id,
        }
      );
      userStates.delete(userId);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Error occurred",
        show_alert: true,
      });
    }
    return;
  }

  // Handle entry cancellation
  if (data === "confirm_entry_no") {
    userState.step = "waiting_for_entry_text";
    userStates.set(userId, userState);

    bot.editMessageText(
      "❌ Entry cancelled.\n\n📝 Please send a new entry text:",
      {
        chat_id: chatId,
        message_id: message.message_id,
      }
    );
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Entry cancelled",
    });
    return;
  }

  // Handle edit entry
  if (data === "edit_entry") {
    userState.step = "waiting_for_entry_text";
    userStates.set(userId, userState);

    bot.editMessageText(
      "✏️ Let's try again.\n\n📝 Please send your entry text:",
      {
        chat_id: chatId,
        message_id: message.message_id,
      }
    );
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "Ready for new entry",
    });
    return;
  }
});

// Add /cancel command handler
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  console.log(`\n❌ /cancel command from ${username}`);

  // Check if user has any active state
  const userState = userStates.get(userId);

  if (userState) {
    userStates.delete(userId);
    bot.sendMessage(
      chatId,
      `❌ Current operation cancelled.\n\nYou can start fresh with:\n🆕 /new_l - Create a new ledger\n📝 /new_e - Add a new entry`
    );
  } else {
    bot.sendMessage(
      chatId,
      `ℹ️ No active operation to cancel.\n\nAvailable commands:\n🆕 /new_l - Create a new ledger\n📝 /new_e - Add a new entry`
    );
  }
});

// Add /status command handler
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;

  console.log(`\n📊 /status command from ${username}`);

  bot.sendMessage(
    chatId,
    `🤖 Bot Status: Active ✅\n\n📊 Available Features:\n• Create ledgers with Google Sheets\n• Add entries with AI processing\n• Automatic balance calculation\n\n🚀 Ready to help with your ledger management!`
  );
});

//..............Functions................//
async function processEntryWithGemini(entryText) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });

    const prompt = `
You are a ledger entry processor. Analyze the following entry text and extract structured data for a financial ledger. Return ONLY valid JSON (no markdown, no code blocks, no additional text):

Entry Text: "${entryText}"

Please analyze this entry and respond with a JSON object containing:
{
  "isValid": boolean, // true if this looks like a valid financial entry
  "date": "DD-MM-YYYY", // today's date or extracted date
  "vchName": "string", // voucher name/type (e.g., "Payment", "Receipt", "Purchase", etc.)
  "description": "string", // clean description of the transaction
  "debit": number, // amount if it's a debit (money going out/expense)
  "credit": number, // amount if it's a credit (money coming in/income)
  "partyName": "string", // person/entity involved in transaction
  "confidence": number, // 0-1 score of how confident you are in this parsing
  "reasoning": "string" // brief explanation of your parsing
}

Rules:
1. Only ONE of debit or credit should have a value, the other should be 0
2. If someone "paid" or "spent" money, it's usually a debit
3. If someone "received" or "earned" money, it's usually a credit
4. Extract amounts from text (handle formats like "200", "₹200", "Rs.200", "200 rupees")
5. Generate appropriate voucher names like "Payment", "Receipt", "Purchase", "Sale", etc.
6. Use today's date if no date is mentioned
7. Be conservative - if you're not sure, set isValid to false

Current date: ${new Date().toISOString().split("T")[0]}

Respond with ONLY the JSON object, no additional text.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Clean up the response - remove markdown code blocks if present
    text = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Additional cleanup for any backticks
    text = text.replace(/`/g, "");

    console.log("Gemini raw response:", text);

    // Parse the JSON response
    const parsedData = JSON.parse(text);


    // const result = await model.generateContent(prompt);
    // const response = await result.response;
    // const text = response.text();

    // // Parse the JSON response
    // const parsedData = JSON.parse(text);

    return {
      isSuccess: true,
      data: parsedData,
    };
  } catch (error) {
    console.error("Error processing entry with Gemini:", error);
    return {
      isSuccess: false,
      message: "Failed to process entry with AI",
    };
  }
}

// Function to add entry to Google Sheet
async function addEntryToSheet(ledger, entryData) {
  try {
    const { sheets } = await initializeGoogleSheets();
    const spreadsheetId = ledger.sheetId;

    if (!spreadsheetId) {
      throw new Error("Ledger does not have an associated Google Sheet");
    }

    // Get current data to calculate new balance
    const currentData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Ledger!A:H",
    });

    const rows = currentData.data.values || [];
    const dataRows = rows.slice(4); // Skip header rows

    // Calculate current balance
    let currentBalance = 0;
    if (dataRows.length > 0) {
      const lastRow = dataRows[dataRows.length - 1];
      currentBalance = parseFloat(lastRow[6]) || 0; // Balance column
    }

    // Calculate new balance
    const newBalance = currentBalance + entryData.credit - entryData.debit;

    // Prepare new row data
    const newRow = [
      entryData.date,
      entryData.vchName,
      entryData.vchNumber || nanoid(), 
      entryData.description,
      entryData.debit || "",
      entryData.credit || "",
      newBalance,
      entryData.partyName,
    ];

    // Add the new row
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Ledger!A:H",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [newRow],
      },
    });

    return {
      isSuccess: true,
      data: {
        newBalance,
        rowAdded: result.data.updates.updatedRows,
      },
    };
  } catch (error) {
    console.error("Error adding entry to sheet:", error);
    return {
      isSuccess: false,
      message: `Failed to add entry to sheet: ${error.message}`,
    };
  }
}

//...........................new_e end..........................//

// Handle polling errors
bot.on("polling_error", (error) => {
  console.error("❌ Polling error:", error);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down bot...");
  bot.stopPolling();
  process.exit(0);
});

console.log("✅ Bot is now listening for messages!");
console.log("💡 Send a message to your bot to see it logged here.");
