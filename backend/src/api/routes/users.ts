import { usersContract } from "@croco-calc/contracts/users";
import { initServer } from "@ts-rest/express";
import * as UserController from "../controllers/user";
import { callController } from "../ts-rest-adapter";

const s = initServer();
export default s.router(usersContract, {
  get: {
    handler: async (r) => callController(UserController.getUser)(r),
  },
  create: {
    handler: async (r) => callController(UserController.createNewUser)(r),
  },
  getNameAvailability: {
    handler: async (r) => callController(UserController.checkName)(r),
  },
  delete: {
    handler: async (r) => callController(UserController.deleteUser)(r),
  },
  reset: {
    handler: async (r) => callController(UserController.resetUser)(r),
  },
  updateName: {
    handler: async (r) => callController(UserController.updateName)(r),
  },
  updateLeaderboardMemory: {
    handler: async (r) => callController(UserController.updateLbMemory)(r),
  },
  updateEmail: {
    handler: async (r) => callController(UserController.updateEmail)(r),
  },
  updatePassword: {
    handler: async (r) => callController(UserController.updatePassword)(r),
  },
  getPersonalBests: {
    handler: async (r) => callController(UserController.getPersonalBests)(r),
  },
  deletePersonalBests: {
    handler: async (r) => callController(UserController.clearPb)(r),
  },
  optOutOfLeaderboards: {
    handler: async (r) =>
      callController(UserController.optOutOfLeaderboards)(r),
  },
  addResultFilterPreset: {
    handler: async (r) =>
      callController(UserController.addResultFilterPreset)(r),
  },
  removeResultFilterPreset: {
    handler: async (r) =>
      callController(UserController.removeResultFilterPreset)(r),
  },
  getCustomThemes: {
    handler: async (r) => callController(UserController.getCustomThemes)(r),
  },
  addCustomTheme: {
    handler: async (r) => callController(UserController.addCustomTheme)(r),
  },
  deleteCustomTheme: {
    handler: async (r) => callController(UserController.removeCustomTheme)(r),
  },
  editCustomTheme: {
    handler: async (r) => callController(UserController.editCustomTheme)(r),
  },
  getStats: {
    handler: async (r) => callController(UserController.getStats)(r),
  },
  getProfile: {
    handler: async (r) => callController(UserController.getProfile)(r),
  },
  updateProfile: {
    handler: async (r) => callController(UserController.updateProfile)(r),
  },
  getInbox: {
    handler: async (r) => callController(UserController.getInbox)(r),
  },
  updateInbox: {
    handler: async (r) => callController(UserController.updateInbox)(r),
  },
  report: {
    handler: async (r) => callController(UserController.reportUser)(r),
  },
  revokeAllTokens: {
    handler: async (r) => callController(UserController.revokeAllTokens)(r),
  },
  getTestActivity: {
    handler: async (r) => callController(UserController.getTestActivity)(r),
  },
  getCurrentTestActivity: {
    handler: async (r) =>
      callController(UserController.getCurrentTestActivity)(r),
  },
  getFriends: {
    handler: async (r) => callController(UserController.getFriends)(r),
  },
  // C24: vestigial, both answer 503. See controllers/user.ts.
  verificationEmail: {
    handler: async (r) => callController(UserController.verificationEmail)(r),
  },
  forgotPasswordEmail: {
    handler: async (r) => callController(UserController.forgotPasswordEmail)(r),
  },
});
