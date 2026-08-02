import { Configuration } from "@croco-calc/schemas/configuration";

/**
 * This is the base schema for the configuration of the API backend.
 * To add a new configuration. Simply add it to this object.
 * When changing this template, please follow the principle of "Secure by default" (https://en.wikipedia.org/wiki/Secure_by_default).
 */
export const BASE_CONFIGURATION: Configuration = {
  maintenance: false,
  dev: {
    responseSlowdownMs: 0,
  },
  results: {
    savingEnabled: false,
    objectHashCheckEnabled: false,
    filterPresets: {
      enabled: false,
      maxPresetsPerUser: 0,
    },
    limits: {
      regularUser: 1000,
    },
    maxBatchSize: 1000,
  },
  admin: {
    endpointsEnabled: false,
  },
  users: {
    signUp: false,
    lastHashesCheck: {
      enabled: false,
      maxHashes: 0,
    },
    autoBan: {
      enabled: false,
      maxCount: 5,
      maxHours: 1,
    },
    profiles: {
      enabled: false,
    },
    xp: {
      enabled: false,
      gainMultiplier: 0,
      maxDailyBonus: 0,
      minDailyBonus: 0,
    },
    inbox: {
      enabled: false,
      maxMail: 0,
    },
    reporting: {
      enabled: false,
      maxReports: 0,
      contentReportLimit: 0,
    },
  },
  rateLimiting: {
    badAuthentication: {
      enabled: false,
      penalty: 0,
      flaggedStatusCodes: [],
    },
  },
  dailyLeaderboards: {
    enabled: false,
    maxResults: 0,
    leaderboardExpirationTimeInDays: 0,
    validModeRules: [],
    scheduleRewardsModeRules: [],
    topResultsToAnnounce: 1, // This should never be 0. Setting to zero will announce all results.
    xpRewardBrackets: [],
  },
  leaderboards: {
    minTimeSpent: 2 * 60 * 60,
    weeklyXp: {
      enabled: false,
      expirationTimeInDays: 0, // This should atleast be 15
      xpRewardBrackets: [],
    },
  },
  connections: { enabled: false, maxPerUser: 100 },
};

type BaseSchema = {
  type: string;
  label?: string;
  hint?: string;
};

type NumberSchema = {
  type: "number";
  min?: number;
} & BaseSchema;

type BooleanSchema = {
  type: "boolean";
} & BaseSchema;

type StringSchema = {
  type: "string";
} & BaseSchema;

type ArraySchema<T extends unknown[]> = {
  type: "array";
  items: Schema<T>[number];
} & BaseSchema;

type ObjectSchema<T> = {
  type: "object";
  fields: Schema<T>;
} & BaseSchema;

type Schema<T> = {
  [P in keyof T]: T[P] extends unknown[]
    ? ArraySchema<T[P]>
    : T[P] extends number
      ? NumberSchema
      : T[P] extends boolean
        ? BooleanSchema
        : T[P] extends string
          ? StringSchema
          : T[P] extends object
            ? ObjectSchema<T[P]>
            : never;
};

export const CONFIGURATION_FORM_SCHEMA: ObjectSchema<Configuration> = {
  type: "object",
  label: "Server Configuration",
  fields: {
    maintenance: {
      type: "boolean",
      label: "In Maintenance",
    },
    dev: {
      type: "object",
      label: "Development",
      fields: {
        responseSlowdownMs: {
          type: "number",
          label: "Response Slowdown (miliseconds)",
          min: 0,
        },
      },
    },
    results: {
      type: "object",
      label: "Results",
      fields: {
        savingEnabled: {
          type: "boolean",
          label: "Saving Results",
        },
        objectHashCheckEnabled: {
          type: "boolean",
          label: "Object Hash Check",
        },
        filterPresets: {
          type: "object",
          label: "Filter Presets",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            maxPresetsPerUser: {
              type: "number",
              label: "Max Presets Per User",
              min: 0,
            },
          },
        },
        limits: {
          type: "object",
          label: "maximum results",
          fields: {
            regularUser: {
              type: "number",
              label: "for regular users",
              min: 0,
            },
          },
        },
        maxBatchSize: {
          type: "number",
          label: "results endpoint max batch size",
          min: 1,
        },
      },
    },
    admin: {
      type: "object",
      label: "Admin",
      fields: {
        endpointsEnabled: {
          type: "boolean",
          label: "Endpoints Enabled",
        },
      },
    },
    users: {
      type: "object",
      label: "Users",
      fields: {
        signUp: {
          type: "boolean",
          label: "Sign Up Enabled",
        },
        lastHashesCheck: {
          type: "object",
          label: "Last Hashes Check",
          fields: {
            enabled: { type: "boolean", label: "Enabled" },
            maxHashes: { type: "number", label: "Hashes to store" },
          },
        },
        xp: {
          type: "object",
          label: "XP",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            gainMultiplier: {
              type: "number",
              label: "Gain Multiplier",
            },
            maxDailyBonus: {
              type: "number",
              label: "Max Daily Bonus",
            },
            minDailyBonus: {
              type: "number",
              label: "Min Daily Bonus",
            },
          },
        },
        autoBan: {
          type: "object",
          label: "Auto Ban",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            maxCount: {
              type: "number",
              label: "Max Count",
              min: 0,
            },
            maxHours: {
              type: "number",
              label: "Max Hours",
              min: 0,
            },
          },
        },
        inbox: {
          type: "object",
          label: "Inbox",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            maxMail: {
              type: "number",
              label: "Max Messages",
              min: 0,
            },
          },
        },
        profiles: {
          type: "object",
          label: "User Profiles",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
          },
        },
        reporting: {
          type: "object",
          label: "Reporting",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            maxReports: {
              type: "number",
              label: "Max Reports",
            },
            contentReportLimit: {
              type: "number",
              label: "Content Report Limit",
            },
          },
        },
      },
    },
    rateLimiting: {
      type: "object",
      label: "Rate Limiting",
      fields: {
        badAuthentication: {
          type: "object",
          label: "Bad Authentication Rate Limiter",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            penalty: {
              type: "number",
              label: "Penalty",
              min: 0,
            },
            flaggedStatusCodes: {
              type: "array",
              label: "Flagged Status Codes",
              items: {
                label: "Status Code",
                type: "number",
                min: 0,
              },
            },
          },
        },
      },
    },
    dailyLeaderboards: {
      type: "object",
      label: "Daily Leaderboards",
      fields: {
        enabled: {
          type: "boolean",
          label: "Enabled",
        },
        maxResults: {
          type: "number",
          label: "Max Results",
          min: 0,
        },
        leaderboardExpirationTimeInDays: {
          type: "number",
          label: "Leaderboard Expiration Time In Days",
          min: 0,
        },
        validModeRules: {
          type: "array",
          label: "Valid Mode Rules",
          items: {
            type: "object",
            label: "Rule",
            fields: {
              mode: {
                type: "string",
                label: "Mode",
              },
              mode2: {
                type: "string",
                label: "Secondary Mode",
              },
            },
          },
        },
        scheduleRewardsModeRules: {
          type: "array",
          label: "Schedule Rewards Mode Rules",
          items: {
            type: "object",
            label: "Rule",
            fields: {
              mode: {
                type: "string",
                label: "Mode",
              },
              mode2: {
                type: "string",
                label: "Secondary Mode",
              },
            },
          },
        },
        topResultsToAnnounce: {
          type: "number",
          label: "Top Results To Announce",
          min: 1,
          hint: "This should atleast be 1. Setting to zero is very bad.",
        },
        xpRewardBrackets: {
          type: "array",
          label: "XP Reward Brackets",
          items: {
            type: "object",
            label: "Bracket",
            fields: {
              minRank: {
                type: "number",
                label: "Min Rank",
                min: 1,
              },
              maxRank: {
                type: "number",
                label: "Max Rank",
                min: 1,
              },
              minReward: {
                type: "number",
                label: "Min Reward",
                min: 0,
              },
              maxReward: {
                type: "number",
                label: "Max Reward",
                min: 0,
              },
            },
          },
        },
      },
    },
    leaderboards: {
      type: "object",
      label: "Leaderboards",
      fields: {
        minTimeSpent: {
          type: "number",
          label: "Minimum time spent the user needs to get on a leaderboard",
          hint: "Time spent in seconds. Change is only applied after restarting the server.",
          min: 0,
        },
        weeklyXp: {
          type: "object",
          label: "Weekly XP",
          fields: {
            enabled: {
              type: "boolean",
              label: "Enabled",
            },
            expirationTimeInDays: {
              type: "number",
              label: "Expiration time in days",
              min: 0,
              hint: "This should atleast be 15, to allow for past week queries.",
            },
            xpRewardBrackets: {
              type: "array",
              label: "XP Reward Brackets",
              items: {
                type: "object",
                label: "Bracket",
                fields: {
                  minRank: {
                    type: "number",
                    label: "Min Rank",
                    min: 1,
                  },
                  maxRank: {
                    type: "number",
                    label: "Max Rank",
                    min: 1,
                  },
                  minReward: {
                    type: "number",
                    label: "Min Reward",
                    min: 0,
                  },
                  maxReward: {
                    type: "number",
                    label: "Max Reward",
                    min: 0,
                  },
                },
              },
            },
          },
        },
      },
    },
    connections: {
      type: "object",
      label: "Connections",
      fields: {
        enabled: { type: "boolean", label: "Enabled" },
        maxPerUser: {
          type: "number",
          label: "Max Connections per user",
        },
      },
    },
  },
};
