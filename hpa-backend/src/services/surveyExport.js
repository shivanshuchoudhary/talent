const ExcelJS = require("exceljs");
const User = require("../models/User");
const SurveyResponse = require("../models/SurveyResponse");
const {
  SURVEY_QUESTION_COUNT,
  CATEGORY_EXPORT_ORDER
} = require("../constants/surveyQuestions");

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function resolveParticipantStatus(user, response) {
  if (!response) {
    return user ? "Registered (no submission)" : "Unknown";
  }
  if (response.isCompleted) {
    return "Completed";
  }
  if (response.timedOut) {
    return "Timed out";
  }
  const answeredCount = Array.isArray(response.questionsAnswered)
    ? response.questionsAnswered.length
    : 0;
  if (answeredCount > 0) {
    return "In progress";
  }
  return "Started (no answers yet)";
}

function buildAnswerLookup(questionsAnswered) {
  const map = new Map();
  if (!Array.isArray(questionsAnswered)) {
    return map;
  }
  for (const entry of questionsAnswered) {
    if (entry?.questionId != null && entry?.answer != null) {
      map.set(Number(entry.questionId), Number(entry.answer));
    }
  }
  return map;
}

function buildCategoryLookup(categoryResults) {
  const map = new Map();
  const categories = categoryResults?.categories;
  if (!Array.isArray(categories)) {
    return map;
  }
  for (const category of categories) {
    if (category?.categoryId != null) {
      map.set(Number(category.categoryId), category);
    }
  }
  return map;
}

function buildExportColumns() {
  const columns = [
    { header: "Employee Code", key: "employeeCode", width: 16 },
    { header: "Name", key: "name", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Department", key: "department", width: 20 },
    { header: "Designation", key: "designation", width: 20 },
    { header: "Entity", key: "entity", width: 18 },
    { header: "Assessment Status", key: "status", width: 22 },
    { header: "Completed", key: "isCompleted", width: 12 },
    { header: "Timed Out", key: "timedOut", width: 12 },
    { header: "Questions Answered", key: "questionsAnsweredCount", width: 18 },
    { header: "Remaining Seconds", key: "remainingSeconds", width: 18 },
    { header: "Letter Grade", key: "letterGrade", width: 14 },
    { header: "Submitted At", key: "submittedAt", width: 24 },
    { header: "Response Updated At", key: "responseUpdatedAt", width: 24 },
    { header: "User Created At", key: "userCreatedAt", width: 24 }
  ];

  for (const category of CATEGORY_EXPORT_ORDER) {
    const prefix = category.title;
    columns.push(
      { header: `${prefix} — Total`, key: `cat_${category.id}_total`, width: 14 },
      { header: `${prefix} — Average`, key: `cat_${category.id}_avg`, width: 14 },
      { header: `${prefix} — Weighted`, key: `cat_${category.id}_weighted`, width: 14 },
      { header: `${prefix} — Level`, key: `cat_${category.id}_level`, width: 16 }
    );
  }

  for (let questionId = 1; questionId <= SURVEY_QUESTION_COUNT; questionId += 1) {
    columns.push({
      header: `Q${questionId}`,
      key: `q_${questionId}`,
      width: 8
    });
  }

  return columns;
}

function buildExportRow(user, response) {
  const answerLookup = buildAnswerLookup(response?.questionsAnswered);
  const categoryLookup = buildCategoryLookup(response?.categoryResults);

  const row = {
    employeeCode: user?.employeeCode ?? "",
    name: user?.name ?? "",
    email: user?.email ?? "",
    department: user?.Department ?? "",
    designation: user?.Designation ?? "",
    entity: user?.entity ?? "",
    status: resolveParticipantStatus(user, response),
    isCompleted: response?.isCompleted ? "Yes" : "No",
    timedOut: response?.timedOut ? "Yes" : "No",
    questionsAnsweredCount: Array.isArray(response?.questionsAnswered)
      ? response.questionsAnswered.length
      : 0,
    remainingSeconds:
      response?.remainingSeconds === null || response?.remainingSeconds === undefined
        ? ""
        : response.remainingSeconds,
    letterGrade: response?.categoryResults?.letterGrade ?? "",
    submittedAt: formatDate(response?.submittedAt),
    responseUpdatedAt: formatDate(response?.updatedAt),
    userCreatedAt: formatDate(user?.createdAt)
  };

  for (const category of CATEGORY_EXPORT_ORDER) {
    const data = categoryLookup.get(category.id);
    row[`cat_${category.id}_total`] = data?.totalScore ?? "";
    row[`cat_${category.id}_avg`] = data?.averageScore ?? "";
    row[`cat_${category.id}_weighted`] = data?.weightedScore ?? "";
    row[`cat_${category.id}_level`] = data?.scoreLevel ?? "";
  }

  for (let questionId = 1; questionId <= SURVEY_QUESTION_COUNT; questionId += 1) {
    const answer = answerLookup.get(questionId);
    row[`q_${questionId}`] = answer === undefined ? "" : answer;
  }

  return row;
}

async function buildParticipantsExportRows() {
  const [users, responses] = await Promise.all([
    User.find().sort({ createdAt: -1 }).lean(),
    SurveyResponse.find().populate("userId").lean()
  ]);

  const responseByUserId = new Map();
  for (const response of responses) {
    const userRef = response.userId;
    const userId =
      userRef?._id?.toString?.() ??
      (typeof userRef === "string" ? userRef : userRef?.toString?.() ?? "");
    if (userId) {
      responseByUserId.set(userId, response);
    }
  }

  const seenUserIds = new Set();
  const rows = [];

  for (const user of users) {
    const userId = user._id.toString();
    seenUserIds.add(userId);
    const response = responseByUserId.get(userId) ?? null;
    rows.push(buildExportRow(user, response));
  }

  for (const response of responses) {
    const userRef = response.userId;
    const populatedUser =
      userRef && typeof userRef === "object" && userRef._id ? userRef : null;
    if (!populatedUser) {
      continue;
    }
    const userId = populatedUser._id.toString();
    if (seenUserIds.has(userId)) {
      continue;
    }
    rows.push(buildExportRow(populatedUser, response));
  }

  return rows;
}

async function buildSurveyExportWorkbook() {
  const rows = await buildParticipantsExportRows();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sobha Ascend";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Assessment Export", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  const columns = buildExportColumns();
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };

  for (const row of rows) {
    sheet.addRow(row);
  }

  return workbook;
}

async function buildSurveyExportBuffer() {
  const workbook = await buildSurveyExportWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildExportFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `sobha-ascend-assessment-export-${stamp}.xlsx`;
}

async function buildAdminParticipants() {
  const [users, responses] = await Promise.all([
    User.find().sort({ createdAt: -1 }).lean(),
    SurveyResponse.find().populate("userId").lean()
  ]);

  const responseByUserId = new Map();
  for (const response of responses) {
    const userRef = response.userId;
    const userId =
      userRef?._id?.toString?.() ??
      (typeof userRef === "string" ? userRef : userRef?.toString?.() ?? "");
    if (userId) {
      responseByUserId.set(userId, response);
    }
  }

  return users.map((user) => {
    const userId = user._id.toString();
    const response = responseByUserId.get(userId) ?? null;
    return {
      user: {
        id: userId,
        employeeCode: user.employeeCode,
        name: user.name,
        email: user.email,
        Department: user.Department,
        Designation: user.Designation,
        entity: user.entity,
        hasCompletedQuestions: user.hasCompletedQuestions,
        hasTimedOut: user.hasTimedOut,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      response: response
        ? {
            id: response._id.toString(),
            isCompleted: response.isCompleted,
            timedOut: response.timedOut,
            questionsAnsweredCount: Array.isArray(response.questionsAnswered)
              ? response.questionsAnswered.length
              : 0,
            letterGrade: response.categoryResults?.letterGrade ?? null,
            submittedAt: response.submittedAt,
            updatedAt: response.updatedAt
          }
        : null,
      status: resolveParticipantStatus(user, response)
    };
  });
}

module.exports = {
  buildSurveyExportBuffer,
  buildExportFilename,
  buildAdminParticipants,
  resolveParticipantStatus
};
