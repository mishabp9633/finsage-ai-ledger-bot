import User from "../models/user.js";

export const findUserByUsername = async (username) => {
  try {
    console.log("Received data:", username);

    if (!username) {
      return {
        isSuccess: false,
        message: "Username required for list ledgers.",
      };
    }

    console.log("Finding user with username:", username);

    const user = await User.findOne({ username })
    console.log("Found user:", user ? user.username : "No user found");

    if (!user) {
      return {
        isSuccess: false,
        message: "Sorry, cannot find your account. Please contact the admin.",
      };
    }

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
