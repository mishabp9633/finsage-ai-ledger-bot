import Ledger from "../models/ledger.js";
import User from "../models/user.js";

export const createLedgerByUser = async (data) => {
  try {
    const { title, description, username } = data;
    console.log("Received data:", { title, username, description });

    if (!title) {
      return {
        isSuccess: false,
        message: "Title required for create new ledger.",
      };
    }

    if (!username) {
      return {
        isSuccess: false,
        message: "Username required for create new ledger.",
      };
    }

    console.log("Finding user with username:", username);

    // Add timeout and better error handling for user query
    const user = await User.findOne({ username }).maxTimeMS(7000); // 7 second timeout
    console.log("Found user:", user ? user.username : "No user found");

    if (!user) {
      return {
        isSuccess: false,
        message: "Sorry, cannot find your account. Please contact the admin.",
      };
    }

    console.log("Creating ledger for user:", user._id);

    const ledger = await Ledger.findOne({ title })
    if (ledger) {
      return {
        isSuccess: false,
        message: "Sorry, Name already used!.",
      };
    }

    // Create the ledger with proper await and user reference
    const newLedger = await Ledger.create({
      title,
      description: description || "", // Provide default empty string if description is not provided
      createdBy: user._id, // Use the found user's ID
    });

    console.log("New ledger created successfully:", newLedger);

    return {
      isSuccess: true,
      message: `Hey ${username}, ledger "${title}" created successfully!`,
      data: {
        id: newLedger._id,
        uid: newLedger.uid,
        title: newLedger.title,
        description: newLedger.description,
        createdAt: newLedger.createdAt,
      },
    };
  } catch (error) {
    console.error("Error creating ledger:", error);

    // Handle specific MongoDB errors
    if (
      error.name === "MongooseError" &&
      error.message.includes("buffering timed out")
    ) {
      return {
        isSuccess: false,
        message: "Database connection timeout. Please try again.",
      };
    }

    if (error.name === "ValidationError") {
      return {
        isSuccess: false,
        message: "Validation error: " + error.message,
      };
    }

    return {
      isSuccess: false,
      message: "Internal server error. Please try again later.",
    };
  }
};
