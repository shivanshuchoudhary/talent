const mongoose = require("mongoose");
const {
  MANAGER_STATUS_VALUES,
  MANAGER_RATING_VALUES,
  MANAGER_LEVEL_VALUES,
  MANAGER_STATUSES
} = require("../constants/managerFields");

const managerSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: MANAGER_STATUS_VALUES,
      required: true,
      default: MANAGER_STATUSES.NOT_COMPLETED
    },
    averageRating: {
      type: Number,
      required: true,
      min: 0,
      max: 5
    },
    rating: {
      type: String,
      enum: MANAGER_RATING_VALUES,
      required: true
    },
    entity: {
      type: String,
      required: true,
      trim: true
    },
    function: {
      type: String,
      required: true,
      trim: true
    },
    level: {
      type: String,
      enum: MANAGER_LEVEL_VALUES,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Manager", managerSchema);
