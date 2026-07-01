const mongoose = require("mongoose");
const User = require("../models/User");
const SurveyResponse = require("../models/SurveyResponse");
const { isAdminRole } = require("../constants/userRoles");

async function deleteParticipant(userId, actorEmail) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid participant id.");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("Participant not found.");
    error.statusCode = 404;
    throw error;
  }

  if (isAdminRole(user.role)) {
    const error = new Error("Cannot delete an admin account. Revoke admin access first.");
    error.statusCode = 400;
    throw error;
  }

  const surveyResult = await SurveyResponse.deleteOne({ userId: user._id });
  await User.deleteOne({ _id: user._id });

  console.log("[Admin] Deleted participant:", {
    userId: user._id.toString(),
    email: user.email,
    surveyDeleted: surveyResult.deletedCount > 0,
    by: actorEmail
  });

  return {
    userId: user._id.toString(),
    email: user.email,
    surveyDeleted: surveyResult.deletedCount > 0
  };
}

async function resetParticipantSurvey(userId, actorEmail) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid participant id.");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("Participant not found.");
    error.statusCode = 404;
    throw error;
  }

  const surveyResult = await SurveyResponse.deleteOne({ userId: user._id });

  user.hasCompletedQuestions = false;
  user.hasTimedOut = false;
  await user.save();

  console.log("[Admin] Reset participant survey:", {
    userId: user._id.toString(),
    email: user.email,
    surveyDeleted: surveyResult.deletedCount > 0,
    by: actorEmail
  });

  return {
    userId: user._id.toString(),
    email: user.email,
    surveyDeleted: surveyResult.deletedCount > 0
  };
}

module.exports = {
  deleteParticipant,
  resetParticipantSurvey
};
