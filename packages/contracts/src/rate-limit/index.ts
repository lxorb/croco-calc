export type Window = "second" | "minute" | "hour" | "day" | number;
export type RateLimitOptions = {
  /** Timeframe or time in milliseconds */
  window: Window;
  /** Max request within the given window */
  max: number;
};

export const limits = {
  adminLimit: {
    window: 5000, // 5 seconds
    max: 1,
  },

  // Config Routing
  configUpdate: {
    window: "hour",
    max: 500,
  },

  configGet: {
    window: "hour",
    max: 120,
  },

  configDelete: {
    window: "hour",
    max: 120,
  },

  // Leaderboards Routing
  leaderboardsGet: {
    window: "hour",
    max: 500,
  },

  // User reporting
  userReportSubmit: {
    window: 30 * 60 * 1000, // 30 minutes
    max: 50,
  },

  // PSA (Public Service Announcement) Routing
  psaGet: {
    window: "minute",
    max: 60,
  },

  // Get public site stats
  publicStatsGet: {
    window: "minute",
    max: 60,
  },

  // Results Routing
  resultsGet: {
    window: "hour",
    max: 60,
  },

  // Result by id
  resultByIdGet: {
    window: "hour",
    max: 300,
  },

  resultsAdd: {
    window: "hour",
    max: 300,
  },

  resultsDeleteAll: {
    window: "hour",
    max: 10,
  },

  resultsLeaderboardGet: {
    window: "hour",
    max: 60,
  },

  resultsLeaderboardQualificationGet: {
    window: "hour",
    max: 60,
  },

  // Users Routing
  userGet: {
    window: "hour",
    max: 60,
  },

  userSignup: {
    window: "day",
    max: 2,
  },

  userDelete: {
    window: "day",
    max: 3,
  },

  userReset: {
    window: "day",
    max: 3,
  },

  userCheckName: {
    window: "minute",
    max: 60,
  },

  userUpdateName: {
    window: "day",
    max: 3,
  },

  userUpdateLBMemory: {
    window: "minute",
    max: 60,
  },

  userUpdateEmail: {
    window: "hour",
    max: 60,
  },

  userClearPB: {
    window: "hour",
    max: 60,
  },

  userOptOutOfLeaderboards: {
    window: "hour",
    max: 10,
  },

  userCustomFilterAdd: {
    window: "hour",
    max: 60,
  },

  userCustomFilterRemove: {
    window: "hour",
    max: 60,
  },

  userCustomThemeGet: {
    window: "hour",
    max: 30,
  },

  userCustomThemeAdd: {
    window: "hour",
    max: 30,
  },

  userCustomThemeRemove: {
    window: "hour",
    max: 30,
  },

  userCustomThemeEdit: {
    window: "hour",
    max: 30,
  },

  userRevokeAllTokens: {
    window: "hour",
    max: 10,
  },

  userProfileGet: {
    window: "hour",
    max: 100,
  },

  userProfileUpdate: {
    window: "hour",
    max: 60,
  },

  userMailGet: {
    window: "hour",
    max: 60,
  },

  userMailUpdate: {
    window: "hour",
    max: 60,
  },

  userTestActivity: {
    window: "hour",
    max: 60,
  },

  userCurrentTestActivity: {
    window: "hour",
    max: 60,
  },

  userFriendGet: {
    window: "hour",
    max: 60,
  },

  connectionGet: {
    window: "hour",
    max: 60,
  },

  connectionCreate: {
    window: "hour",
    max: 60,
  },

  connectionDelete: {
    window: "hour",
    max: 60,
  },

  connectionUpdate: {
    window: "hour",
    max: 60,
  },
} satisfies Record<string, RateLimitOptions>;

export type RateLimiterId = keyof typeof limits;

export function getLimits(limit: RateLimiterId): {
  limiter: RateLimitOptions;
} {
  return { limiter: limits[limit] };
}
