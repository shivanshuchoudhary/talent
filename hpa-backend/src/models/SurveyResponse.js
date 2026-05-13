const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: Number,
      required: true,
      min: 1
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    totalScore: {
      type: Number,
      required: true
    },
    averageScore: {
      type: Number,
      required: true
    },
    weightedScore: {
      type: Number,
      required: true
    },
    scoreLevel: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

const surveyResponseSchema = new mongoose.Schema(
  {
    userData: {
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
        lowercase: true
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
      }
    },
    categoryResults: {
      categories: {
        type: [categorySchema],
        required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length > 0,
          message: "categories must contain at least one item."
        }
      },
      letterGrade: {
        type: String,
        required: true,
        trim: true
      }
    },
    questionsAnswered: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value),
        message: "questionsAnswered must be an array."
      }
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SurveyResponse", surveyResponseSchema);
