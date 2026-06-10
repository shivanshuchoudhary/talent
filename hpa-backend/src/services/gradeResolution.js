const { SURVEY_QUESTION_COUNT } = require("../constants/surveyQuestions");

const MIN_QUESTIONS_FOR_FULL_GRADE = 30;

function gradeRank(grade) {
  if (grade === "A+") {
    return 3;
  }
  if (grade === "A") {
    return 2;
  }
  return 1;
}

function isSubmissionTimedOut({ timedOut, hasTimedOut, isCompleted, questionsAnsweredCount }) {
  if (timedOut || hasTimedOut) {
    return true;
  }
  return (
    Boolean(isCompleted) &&
    questionsAnsweredCount > 0 &&
    questionsAnsweredCount < SURVEY_QUESTION_COUNT
  );
}

function resolveEffectiveGrade({
  calculatedGrade,
  timedOut,
  hasTimedOut,
  isCompleted,
  questionsAnsweredCount
}) {
  const calculatedLetterGrade =
    typeof calculatedGrade === "string" && calculatedGrade.trim()
      ? calculatedGrade.trim()
      : null;

  if (!calculatedLetterGrade) {
    return {
      calculatedLetterGrade: null,
      effectiveLetterGrade: null,
      cappedDueToTimeout: false
    };
  }

  const submissionTimedOut = isSubmissionTimedOut({
    timedOut,
    hasTimedOut,
    isCompleted,
    questionsAnsweredCount
  });

  const cappedDueToTimeout =
    submissionTimedOut &&
    questionsAnsweredCount < MIN_QUESTIONS_FOR_FULL_GRADE &&
    gradeRank(calculatedLetterGrade) > gradeRank("B");

  return {
    calculatedLetterGrade,
    effectiveLetterGrade: cappedDueToTimeout ? "B" : calculatedLetterGrade,
    cappedDueToTimeout
  };
}

module.exports = {
  MIN_QUESTIONS_FOR_FULL_GRADE,
  isSubmissionTimedOut,
  resolveEffectiveGrade
};
