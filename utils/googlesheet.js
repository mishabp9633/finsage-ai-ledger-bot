const { google } = require('googleapis');
const path = require('path');

// Google Sheets configuration
const GOOGLE_SHEETS_CONFIG = {
  keyFilename: path.join(__dirname, 'path/to/your/service-account-key.json'), // Update this path
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  parentFolderId: 'your-google-drive-folder-id' // Optional: specify folder ID to organize sheets
};

// Initialize Google Sheets API
async function initializeGoogleSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_SHEETS_CONFIG.keyFilename,
    scopes: GOOGLE_SHEETS_CONFIG.scopes,
  });

  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const drive = google.drive({ version: 'v3', auth: authClient });

  return { sheets, drive };
}

// Create a new Google Sheet for the ledger
async function createLedgerSheet(ledgerData) {
  try {
    const { sheets, drive } = await initializeGoogleSheets();
    
    // Create the spreadsheet
    const spreadsheetRequest = {
      resource: {
        properties: {
          title: `${ledgerData.title} - Ledger`,
          locale: 'en_US',
          timeZone: 'Asia/Kolkata' // Adjust timezone as needed
        },
        sheets: [
          {
            properties: {
              title: 'Ledger',
              gridProperties: {
                rowCount: 1000,
                columnCount: 26
              }
            }
          }
        ]
      }
    };

    const spreadsheet = await sheets.spreadsheets.create(spreadsheetRequest);
    const spreadsheetId = spreadsheet.data.spreadsheetId;
    
    console.log(`📊 Created Google Sheet: ${spreadsheetId}`);

    // Setup the ledger structure
    await setupLedgerStructure(sheets, spreadsheetId, ledgerData);

    // Move to specified folder if configured
    if (GOOGLE_SHEETS_CONFIG.parentFolderId) {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: GOOGLE_SHEETS_CONFIG.parentFolderId,
        removeParents: 'root'
      });
    }

    return {
      isSuccess: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      message: 'Ledger sheet created successfully'
    };

  } catch (error) {
    console.error('Error creating ledger sheet:', error);
    return {
      isSuccess: false,
      message: `Failed to create ledger sheet: ${error.message}`
    };
  }
}

// Setup the ledger structure with headers, formatting, and colors
async function setupLedgerStructure(sheets, spreadsheetId, ledgerData) {
  const requests = [];

  // Define the headers and their structure
  const headers = [
    'Date', 'Description', 'Debit', 'Credit', 'Balance', 'Category', 'Reference', 'Notes'
  ];

  // Set up headers in row 1
  requests.push({
    updateCells: {
      range: {
        sheetId: 0,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length
      },
      rows: [
        {
          values: headers.map(header => ({
            userEnteredValue: { stringValue: header },
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 }, // Blue header background
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 } // White text
              },
              horizontalAlignment: 'CENTER',
              borders: {
                top: { style: 'SOLID', width: 1 },
                bottom: { style: 'SOLID', width: 2 },
                left: { style: 'SOLID', width: 1 },
                right: { style: 'SOLID', width: 1 }
              }
            }
          }))
        }
      ],
      fields: 'userEnteredValue,userEnteredFormat'
    }
  });

  // Set column widths
  const columnWidths = [100, 200, 100, 100, 100, 120, 100, 150]; // Adjust as needed
  columnWidths.forEach((width, index) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: 0,
          dimension: 'COLUMNS',
          startIndex: index,
          endIndex: index + 1
        },
        properties: {
          pixelSize: width
        },
        fields: 'pixelSize'
      }
    });
  });

  // Freeze header row
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: 0,
        gridProperties: {
          frozenRowCount: 1
        }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Add title section above headers
  requests.push({
    insertDimension: {
      range: {
        sheetId: 0,
        dimension: 'ROWS',
        startIndex: 0,
        endIndex: 3
      }
    }
  });

  // Add ledger title
  requests.push({
    updateCells: {
      range: {
        sheetId: 0,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length
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
                  foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 }
                },
                horizontalAlignment: 'CENTER'
              }
            }
          ]
        }
      ],
      fields: 'userEnteredValue,userEnteredFormat'
    }
  });

  // Merge title cells
  requests.push({
    mergeCells: {
      range: {
        sheetId: 0,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: headers.length
      },
      mergeType: 'MERGE_ALL'
    }
  });

  // Add creation info
  requests.push({
    updateCells: {
      range: {
        sheetId: 0,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: headers.length
      },
      rows: [
        {
          values: [
            {
              userEnteredValue: { 
                stringValue: `Created by: ${ledgerData.username} | Created on: ${new Date().toLocaleString()}` 
              },
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                textFormat: {
                  fontSize: 10,
                  foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 }
                },
                horizontalAlignment: 'CENTER'
              }
            }
          ]
        }
      ],
      fields: 'userEnteredValue,userEnteredFormat'
    }
  });

  // Merge creation info cells
  requests.push({
    mergeCells: {
      range: {
        sheetId: 0,
        startRowIndex: 1,
        endRowIndex: 2,
        startColumnIndex: 0,
        endColumnIndex: headers.length
      },
      mergeType: 'MERGE_ALL'
    }
  });

  // Now update the header row (which is now row 4 due to inserted rows)
  requests.push({
    updateCells: {
      range: {
        sheetId: 0,
        startRowIndex: 3,
        endRowIndex: 4,
        startColumnIndex: 0,
        endColumnIndex: headers.length
      },
      rows: [
        {
          values: headers.map(header => ({
            userEnteredValue: { stringValue: header },
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 }
              },
              horizontalAlignment: 'CENTER',
              borders: {
                top: { style: 'SOLID', width: 1 },
                bottom: { style: 'SOLID', width: 2 },
                left: { style: 'SOLID', width: 1 },
                right: { style: 'SOLID', width: 1 }
              }
            }
          }))
        }
      ],
      fields: 'userEnteredValue,userEnteredFormat'
    }
  });

  // Update frozen row count to account for title rows
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: 0,
        gridProperties: {
          frozenRowCount: 4
        }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Add data validation for Date column (column A, starting from row 5)
  requests.push({
    setDataValidation: {
      range: {
        sheetId: 0,
        startRowIndex: 4,
        endRowIndex: 1000,
        startColumnIndex: 0,
        endColumnIndex: 1
      },
      rule: {
        condition: {
          type: 'DATE_IS_VALID'
        },
        showCustomUi: true,
        strict: true
      }
    }
  });

  // Add data validation for Debit and Credit columns (numbers only)
  [2, 3].forEach(colIndex => {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: 0,
          startRowIndex: 4,
          endRowIndex: 1000,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1
        },
        rule: {
          condition: {
            type: 'NUMBER_GREATER_THAN_EQ',
            values: [{ userEnteredValue: '0' }]
          },
          showCustomUi: true,
          strict: true
        }
      }
    });
  });

  // Execute all requests
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests }
  });

  console.log('✅ Ledger structure setup completed');
}

// Updated bot callback query handler with Google Sheets integration
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
          `✅ Ledger Created Successfully!\n\n🏷️ Name: "${response.data.title}"\n🆔 ID: ${response.data.id}\n👤 Created by: ${username}\n📅 Created at: ${new Date(response.data.createdAt).toLocaleString()}\n\n📊 Creating Google Sheet...`,
          {
            chat_id: chatId,
            message_id: message.message_id,
          }
        );

        // Create Google Sheet
        const sheetData = {
          ...ledgerData,
          ledgerId: response.data.id,
          createdAt: response.data.createdAt
        };

        const sheetResponse = await createLedgerSheet(sheetData);

        if (sheetResponse.isSuccess) {
          // Update message with Google Sheet success
          bot.editMessageText(
            `✅ Ledger & Google Sheet Created Successfully!\n\n🏷️ Name: "${response.data.title}"\n🆔 ID: ${response.data.id}\n👤 Created by: ${username}\n📅 Created at: ${new Date(response.data.createdAt).toLocaleString()}\n\n📊 Google Sheet: [Open Sheet](${sheetResponse.spreadsheetUrl})\n📋 Sheet ID: ${sheetResponse.spreadsheetId}\n\n🎉 Your ledger is ready to use!`,
            {
              chat_id: chatId,
              message_id: message.message_id,
              parse_mode: 'Markdown',
              disable_web_page_preview: true
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

// Export the Google Sheets functions for use in other parts of your application
module.exports = {
  createLedgerSheet,
  setupLedgerStructure,
  initializeGoogleSheets
};