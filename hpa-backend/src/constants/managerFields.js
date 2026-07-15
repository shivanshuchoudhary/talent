const MANAGER_STATUSES = {
  COMPLETED: "completed",
  NOT_COMPLETED: "not_completed",
  IN_PROGRESS: "in_progress"
};

const MANAGER_STATUS_VALUES = Object.values(MANAGER_STATUSES);

const MANAGER_RATINGS = {
  A: "A",
  B: "B",
  DASH: "-"
};

const MANAGER_RATING_VALUES = Object.values(MANAGER_RATINGS);

const MANAGER_LEVELS = {
  N2: "n-2",
  N3: "n-3"
};

const MANAGER_LEVEL_VALUES = Object.values(MANAGER_LEVELS);

const MANAGER_IMPORT_FIELDS = [
  "employeeCode",
  "name",
  "status",
  "averageRating",
  "rating",
  "entity",
  "function"
];

module.exports = {
  MANAGER_STATUSES,
  MANAGER_STATUS_VALUES,
  MANAGER_RATINGS,
  MANAGER_RATING_VALUES,
  MANAGER_LEVELS,
  MANAGER_LEVEL_VALUES,
  MANAGER_IMPORT_FIELDS
};
