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
      role: "admin"
    };
  }

  const user = await User.findOne({ email }).select("role");
  const role = user?.role ?? "user";
  const isDbAdmin = isAdminRole(role);
  const isEnvBootstrapAdmin =
    azureAuth.adminEmails.has(email) || azureAuth.superAdminEmails.has(email);

  const isAdmin = isDbAdmin || isEnvBootstrapAdmin;
  const isSuperAdmin =
    isSuperAdminRole(role) || azureAuth.superAdminEmails.has(email);

  return {
    isAdmin,
    isSuperAdmin,
    role
  };
}

module.exports = { resolveAdminAccess };
