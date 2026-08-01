export const contestRuleKeys = [
  "SUBMISSION_LIMIT",
  "SUBMISSION_RULES",
  "LEVEL_REQUIREMENTS",
  "SUBMISSION_FORMAT",
  "ELIGIBILITY",
  "COPYRIGHT",
  "VOTING",
  "PARTICIPATION",
] as const;

export type ContestRuleKey = (typeof contestRuleKeys)[number];

export type ContestRuleApplyPoint = "JOIN" | "PHOTO_UPLOAD" | "VOTING" | "RANKING" | "DISPLAY";
export type ContestRuleInputType = "number" | "list" | "object";
export type ContestRuleFieldDefinition = {
  path: string;
  label: string;
  inputType: "text" | "textarea" | "number" | "boolean" | "select" | "multi-select" | "list";
  required?: boolean;
  options?: readonly string[];
};

export type LevelRequirementValue = {
  level: "AMATEUR" | "TALENTED" | "SUPREME" | "SUPERIOR" | "TOP_NOTCH";
  votes: number;
};

export type SubmissionFormatValue = {
  mimeTypes: string[];
  minWidth: number;
  minHeight: number;
  maxSizeMB: number;
};

export const supportedContestImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
] as const;

export type ContestRuleDefinition<TValue = unknown> = {
  key: ContestRuleKey;
  label: string;
  description?: string;
  icon?: string;
  inputType: ContestRuleInputType;
  defaultValue: TValue;
  appliesTo: ContestRuleApplyPoint[];
  displayOnly: boolean;
  order: number;
};

export type ContestRuleDefinitionView = {
  key: ContestRuleKey;
  label: string;
  description?: string;
  inputType: ContestRuleInputType;
  value: unknown;
  payload: Record<ContestRuleKey, unknown>;
};

export const contestRuleDefinitions: Record<ContestRuleKey, ContestRuleDefinition> = {
  SUBMISSION_LIMIT: {
    key: "SUBMISSION_LIMIT",
    label: "Submission Limit",
    description: "Maximum number of photos a participant can submit to the contest.",
    icon: "number-circle",
    inputType: "number",
    defaultValue: 4,
    appliesTo: ["PHOTO_UPLOAD", "DISPLAY"],
    displayOnly: false,
    order: 10,
  },
  SUBMISSION_RULES: {
    key: "SUBMISSION_RULES",
    label: "Submission Rules",
    description: "Content rules enforced when a participant uploads contest photos.",
    icon: "image-upload",
    inputType: "list",
    defaultValue: [
      "Non-relevant images are not allowed.",
      "Similar images with the same subject, background, foreground, and location are not allowed.",
      "The same image cannot be submitted multiple times, including cropped, angle, or tone changes.",
      "AI-generated images are not allowed.",
      "Images that do not comply may be removed from the challenge.",
    ],
    appliesTo: ["PHOTO_UPLOAD", "DISPLAY"],
    displayOnly: false,
    order: 20,
  },
  LEVEL_REQUIREMENTS: {
    key: "LEVEL_REQUIREMENTS",
    label: "Level Requirements",
    description: "Vote thresholds used to award contest level badges during ranking.",
    icon: "level-stars",
    inputType: "list",
    defaultValue: [
      { level: "AMATEUR", votes: 50 },
      { level: "TALENTED", votes: 250 },
      { level: "SUPREME", votes: 900 },
      { level: "SUPERIOR", votes: 1900 },
      { level: "TOP_NOTCH", votes: 5000 },
    ],
    appliesTo: ["RANKING", "DISPLAY"],
    displayOnly: false,
    order: 30,
  },
  SUBMISSION_FORMAT: {
    key: "SUBMISSION_FORMAT",
    label: "Submission Format",
    description: "Allowed image formats, dimensions, and upload size limits.",
    icon: "image-plus",
    inputType: "object",
    defaultValue: {
      mimeTypes: ["image/jpeg"],
      minWidth: 700,
      minHeight: 700,
      maxSizeMB: 25,
    },
    appliesTo: ["PHOTO_UPLOAD", "DISPLAY"],
    displayOnly: false,
    order: 40,
  },
  ELIGIBILITY: {
    key: "ELIGIBILITY",
    label: "Eligibility",
    description: "Eligibility text and acceptance requirement shown before joining.",
    icon: "file-check",
    inputType: "object",
    defaultValue: {
      minAge: 18,
      text: "Open to all photographers ages 18 and above. Photos must not contain obscene, provocative, defamatory, sexually explicit, or otherwise objectionable or inappropriate content. Photos deemed inappropriate will be disqualified. Challenge void where prohibited.",
      requiresAcceptance: true,
    },
    appliesTo: ["JOIN", "DISPLAY"],
    displayOnly: false,
    order: 50,
  },
  COPYRIGHT: {
    key: "COPYRIGHT",
    label: "Copyright",
    description: "Ownership and copyright acceptance rules for submitted photos.",
    icon: "copyright",
    inputType: "object",
    defaultValue: {
      text: "You maintain the copyrights to all photos you submit. You must own all submitted images.",
      requiresOwnership: true,
      requiresAcceptance: true,
    },
    appliesTo: ["JOIN", "PHOTO_UPLOAD", "DISPLAY"],
    displayOnly: false,
    order: 60,
  },
  VOTING: {
    key: "VOTING",
    label: "Voting",
    description: "Voting permissions and fairness rules for the contest.",
    icon: "vote",
    inputType: "object",
    defaultValue: {
      text: "Voting is done by members of the site only. The voting system uses a blind voting method which is designed to keep the voting as fair as possible.",
      membersOnly: true,
      requireContestParticipant: true,
      disallowSelfVote: true,
      blindVoting: true,
    },
    appliesTo: ["VOTING", "DISPLAY"],
    displayOnly: false,
    order: 70,
  },
  PARTICIPATION: {
    key: "PARTICIPATION",
    label: "Participation",
    description: "General participation terms accepted by contest entrants.",
    icon: "user",
    inputType: "object",
    defaultValue: {
      text: "By entering this challenge you accept the standard Terms of Use.",
      requiresTermsAcceptance: true,
      termsUrl: null,
    },
    appliesTo: ["JOIN", "DISPLAY"],
    displayOnly: false,
    order: 80,
  },
};

export const getContestRuleFields = (key: ContestRuleKey): ContestRuleFieldDefinition[] => {
  switch (key) {
    case "SUBMISSION_LIMIT":
      return [{ path: "value", label: "Submission limit", inputType: "number", required: true }];
    case "SUBMISSION_RULES":
      return [
        { path: "value", label: "Submission rules", inputType: "list", required: true },
      ];
    case "LEVEL_REQUIREMENTS":
      return [
        {
          path: "value",
          label: "Level vote thresholds",
          inputType: "list",
          required: true,
          options: ["AMATEUR", "TALENTED", "SUPREME", "SUPERIOR", "TOP_NOTCH"],
        },
      ];
    case "SUBMISSION_FORMAT":
      return [
        {
          path: "mimeTypes",
          label: "Allowed MIME types",
          inputType: "multi-select",
          required: true,
          options: supportedContestImageMimeTypes,
        },
        { path: "minWidth", label: "Minimum width", inputType: "number", required: true },
        { path: "minHeight", label: "Minimum height", inputType: "number", required: true },
        { path: "maxSizeMB", label: "Maximum size MB", inputType: "number", required: true },
      ];
    case "ELIGIBILITY":
      return [
        { path: "minAge", label: "Minimum age", inputType: "number" },
        { path: "text", label: "Eligibility text", inputType: "textarea", required: true },
        { path: "requiresAcceptance", label: "Requires acceptance", inputType: "boolean" },
      ];
    case "COPYRIGHT":
      return [
        { path: "text", label: "Copyright text", inputType: "textarea", required: true },
        { path: "requiresOwnership", label: "Requires ownership", inputType: "boolean" },
        { path: "requiresAcceptance", label: "Requires acceptance", inputType: "boolean" },
      ];
    case "VOTING":
      return [
        { path: "text", label: "Voting text", inputType: "textarea", required: true },
        { path: "membersOnly", label: "Members only", inputType: "boolean" },
        { path: "requireContestParticipant", label: "Participant required", inputType: "boolean" },
        { path: "disallowSelfVote", label: "Disallow self vote", inputType: "boolean" },
        { path: "blindVoting", label: "Blind voting", inputType: "boolean" },
      ];
    case "PARTICIPATION":
      return [
        { path: "text", label: "Participation text", inputType: "textarea", required: true },
        { path: "requiresTermsAcceptance", label: "Requires terms acceptance", inputType: "boolean" },
        { path: "termsUrl", label: "Terms URL", inputType: "text" },
      ];
  }
};

export const getContestRuleDefinitions = () =>
  contestRuleKeys.map((key) => contestRuleDefinitions[key]).sort((a, b) => a.order - b.order);

export const getContestRuleDefinitionViews = (): ContestRuleDefinitionView[] =>
  getContestRuleDefinitions().map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    inputType: definition.inputType,
    value: definition.defaultValue,
    payload: {
      [definition.key]: definition.defaultValue,
    } as Record<ContestRuleKey, unknown>,
  }));

export const isContestRuleKey = (key: string): key is ContestRuleKey =>
  contestRuleKeys.includes(key as ContestRuleKey);
