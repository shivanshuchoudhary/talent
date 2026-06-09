const azureAuth = require("../config/azureAuth");
const User = require("../models/User");
const { isAdminRole, isSuperAdminRole } = require("../constants/userRoles");

async function resolveAdminAccess(email) {
  if (!email) {
    return {
      isAdmin: false,
      isSuperAdmin: false,
      role: null
    };
  }

  if (azureAuth.authDisabled) {
    return {
      isAdmin: true,
      isSuperAdmin: true,
      role: "super_admin"
    };
  }

  const user = await User.findOne({ email }).select("role");
  const role = user?.role ?? "user";

  return {
    isAdmin: isAdminRole(role),
    isSuperAdmin: isSuperAdminRole(role),
    role
  };
}

module.exports = { resolveAdminAccess };
