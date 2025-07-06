// telegram-bot.js
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from 'url'; 

import { createLedgerByUser } from "../services/ledger.js";
import { connectDB } from "../db/dbconnection.js";
import Ledger from "../models/ledger.js";
import User from "../models/user.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
await connectDB();

// Google Sheets configuration
const GOOGLE_SHEETS_CONFIG = {
  keyFilename: "../service-account-key.json",
  keyFilename: path.join(__dirname, "../service-account-key.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
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
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store user conversation states
const userStates = new Map();

console.log("🤖 Telegram bot is starting...");

// Handle text messages
bot.on("text", (msg) => {
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

  const welcomeMessage = `Welcome ${username}! 🎉\n\nI'm your Personal Ledger Bot! 📊\n\n📋 What I can do:\n🆕 /new l - Create a new ledger\n📝 /new e - Create a new ledger entry\n\n🔧 Other Commands:\n/help - Get detailed help\n/status - Check bot status\n/cancel - Cancel current operation\n\n💡 Start by creating your first ledger with /new l`;

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
    `📝 Please enter your ledger name:\n\nExample: "Alungal Building Work"`
  );
});

// Handle callback queries (button presses)

// bot.on("callback_query", async (callbackQuery) => {
//   const message = callbackQuery.message;
//   const chatId = message.chat.id;
//   const userId = callbackQuery.from.id;
//   const username = callbackQuery.from.username || callbackQuery.from.first_name;
//   const data = callbackQuery.data;

//   console.log(`\n🔘 Button pressed by ${username}: ${data}`);

//   const userState = userStates.get(userId);

//   if (
//     data === "confirm_ledger_yes" &&
//     userState &&
//     userState.step === "waiting_for_confirmation"
//   ) {
//     const ledgerName = userState.ledgerName;

//     console.log(
//       `\n✅ User ${username} confirmed ledger creation: "${ledgerName}"`
//     );

//     const ledgerData = {
//       title: ledgerName,
//       description: "",
//       username,
//     };

//     try {
//       const response = await createLedgerByUser(ledgerData);

//       if (response.isSuccess) {
//         bot.editMessageText(
//           `✅ Ledger Created Successfully!\n\n🏷️ Name: "${
//             response.data.title
//           }"\n🆔 ID: ${
//             response.data.id
//           }\n👤 Created by: ${username}\n📅 Created at: ${new Date(
//             response.data.createdAt
//           ).toLocaleString()}\n\n🎉 Your ledger is ready to use!`,
//           {
//             chat_id: chatId,
//             message_id: message.message_id,
//           }
//         );
//       } else {
//         bot.editMessageText(
//           `⚠️ Failed to create ledger.\n\n❌ Reason: ${response.message}`,
//           {
//             chat_id: chatId,
//             message_id: message.message_id,
//           }
//         );
//       }

//       userStates.delete(userId);
//       bot.answerCallbackQuery(callbackQuery.id, {
//         text: response.isSuccess
//           ? "Ledger created successfully!"
//           : "Ledger creation failed",
//         show_alert: !response.isSuccess,
//       });
//     } catch (error) {
//       console.error("Unexpected error during ledger creation:", error);

//       bot.editMessageText(
//         `🚨 Unexpected Error: Ledger creation failed due to a system issue.\n\nPlease try again or contact support.`,
//         {
//           chat_id: chatId,
//           message_id: message.message_id,
//         }
//       );

//       userStates.delete(userId);
//       bot.answerCallbackQuery(callbackQuery.id, {
//         text: "Unexpected system error occurred.",
//         show_alert: true,
//       });
//     }
//   }
// });

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
          bot.editMessageText(
            `✅ Ledger & Google Sheet Created Successfully!\n\n🏷️ Name: "${
              response.data.title
            }"\n🆔 ID: ${
              response.data.id
            }\n👤 Created by: ${username}\n📅 Created at: ${new Date(
              response.data.createdAt
            ).toLocaleString()}\n\n📊 Google Sheet: [Open Sheet](${
              sheetResponse.spreadsheetUrl
            })\n📋 Sheet ID: ${
              sheetResponse.spreadsheetId
            }\n\n🎉 Your ledger is ready to use!`,
            {
              chat_id: chatId,
              message_id: message.message_id,
              parse_mode: "Markdown",
              disable_web_page_preview: true,
            }
          );
        } else {
          // Ledger created but sheet failed
          bot.editMessageText(
            `⚠️ Ledger created but Google Sheet creation failed.\n\n✅ Ledger: "${response.data.title}" (ID: ${response.data.id})\n❌ Google Sheet: ${sheetResponse.message}\n\n💡 You can manually create the sheet later or try again.`,
            {
              chat_id: chatId,
              message_id: message.message_id,
            }
          );
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

    console.log('sheets, drive', sheets, drive);
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
async function setupLedgerStructure(sheets, spreadsheetId, sheetId, ledgerData) {
  const requests = [];

  // Define the headers and their structure
  const headers = [
    "Date",
    "Description",
    "Debit",
    "Credit",
    "Balance",
    "Category",
    "Reference",
    "Notes",
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
  const columnWidths = [100, 200, 100, 100, 100, 120, 100, 150]; // Adjust as needed
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
    `📚 Choose a ledger to add an entry:\n\nPage ${page + 1} of ${totalPages}`,
    {
      reply_markup: { inline_keyboard: inlineKeyboard },
    }
  );
}

bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  const userState = userStates.get(userId);

  // Handle pagination
  if (data.startsWith("ledger_page:")) {
    const page = parseInt(data.split(":")[1], 10);
    if (userState && userState.ledgers) {
      userState.page = page;
      userStates.set(userId, userState);

      // Delete old message before sending new
      await bot.deleteMessage(chatId, msg.message_id);
      sendLedgerPage(chatId, userId, page, userState.ledgers);
    }
    return;
  }

  // Handle ledger selection
  if (data.startsWith("select_ledger:")) {
    const ledgerId = data.split(":")[1];
    userState.selectedLedgerId = ledgerId;
    userState.step = "waiting_for_entry_text";
    userStates.set(userId, userState);

    bot.editMessageText(
      `✅ Ledger selected.\nNow send your entry (e.g., "Paid 200 for materials")`,
      {
        chat_id: chatId,
        message_id: msg.message_id,
      }
    );
    return;
  }

  userStates.delete(userId);

  // other handlers like confirm_ledger_yes...
});

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
