const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
    },
    Department: {
      type: String,
      required: true,
      trim: true
    },
    Designation: {
      type: String,
      required: true,
      trim: true
    },
    entity: {
      type: String,
      required: true,
      trim: true
    },
    hasCompletedQuestions: {
      type: Boolean,
      required: true,
      default: false
    },
    hasTimedOut: {
      type: Boolean,
      required: true,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
