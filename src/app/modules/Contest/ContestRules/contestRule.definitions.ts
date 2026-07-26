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

export type LevelRequirementValue = {
  level: "POPULAR" | "SKILLED" | "PREMIER" | "ELITE" | "ALL_STAR";
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

export const contestRuleDefinitions: Record<ContestRuleKey, ContestRuleDefinition> = {
  SUBMISSION_LIMIT: {
    key: "SUBMISSION_LIMIT",
    label: "Submission Limit",
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
    icon: "image-upload",
    inputType: "object",
    defaultValue: {
      intro: "Do not post:",
      disallowed: [
        "Non-relevant images",
        "Similar images: Images with the same combination of subject, background, foreground and location are not allowed. Images must be distinct",
        "Same image multiple times (cropped, angle change or tone changes)",
        "AI images",
      ],
      removalNotice: "Images that don't comply may be removed from the challenge.",
      allowAiImages: false,
      duplicatePolicy: "DISALLOW_SAME_PHOTO",
    },
    appliesTo: ["PHOTO_UPLOAD", "DISPLAY"],
    displayOnly: false,
    order: 20,
  },
  LEVEL_REQUIREMENTS: {
    key: "LEVEL_REQUIREMENTS",
    label: "Level Requirements",
    icon: "level-stars",
    inputType: "list",
    defaultValue: [
      { level: "POPULAR", votes: 50 },
      { level: "SKILLED", votes: 250 },
      { level: "PREMIER", votes: 900 },
      { level: "ELITE", votes: 1900 },
      { level: "ALL_STAR", votes: 5000 },
    ],
    appliesTo: ["RANKING", "DISPLAY"],
    displayOnly: false,
    order: 30,
  },
  SUBMISSION_FORMAT: {
    key: "SUBMISSION_FORMAT",
    label: "Submission Format",
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

export const getContestRuleDefinitions = () =>
  contestRuleKeys.map((key) => contestRuleDefinitions[key]).sort((a, b) => a.order - b.order);

export const isContestRuleKey = (key: string): key is ContestRuleKey =>
  contestRuleKeys.includes(key as ContestRuleKey);
