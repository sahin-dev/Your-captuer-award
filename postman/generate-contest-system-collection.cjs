const fs = require("fs");
const path = require("path");

const outputPath = path.join(__dirname, "Contest-System.postman_collection.json");
const schema = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const ids = {
  user: "66a100000000000000000001",
  voter: "66a100000000000000000002",
  admin: "66a100000000000000000003",
  contest: "66b200000000000000000001",
  recurringContest: "66b200000000000000000002",
  participant: "66c300000000000000000001",
  voterParticipant: "66c300000000000000000002",
  userPhoto: "66d400000000000000000001",
  contestPhoto: "66e500000000000000000001",
  prize: "66f600000000000000000001",
  photographerPrize: "66f600000000000000000002",
  ycPickPrize: "66f600000000000000000003",
  topPhotoPrize: "66f600000000000000000004",
  topPhotographerPrize: "66f600000000000000000005",
  winnerPrize: "66f600000000000000000006",
  top20PhotoPrize: "66f600000000000000000007",
  top20PhotographerPrize: "66f600000000000000000008",
  top50PhotoPrize: "66f600000000000000000009",
  top50PhotographerPrize: "66f60000000000000000000a",
  top100PhotoPrize: "66f60000000000000000000b",
  top100PhotographerPrize: "66f60000000000000000000c",
  photoAward: "670700000000000000000002",
  photographerAward: "670700000000000000000003",
  award: "670700000000000000000001",
  vote: "671800000000000000000001",
  achievement: "672900000000000000000001",
  selection: "673a00000000000000000001",
  category: "674b00000000000000000001",
};

const now = "2026-07-22T10:00:00.000Z";
const later = "2026-07-22T11:00:00.000Z";
const defaultBanner = "https://images.unsplash.com/photo-1689539137236-b68e436248de?q=80&w=1171&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

const userDto = (id = ids.user, role = "USER") => ({
  id,
  firstName: role === "ADMIN" ? "Contest" : "Test",
  lastName: role === "ADMIN" ? "Admin" : "Participant",
  username: null,
  email: role === "ADMIN" ? "admin@example.com" : "participant@example.com",
  role,
  phone: "+8801700000000",
  dateOfBirth: "1995-01-01T00:00:00.000Z",
  avatar: null,
  cover: null,
  location: null,
});

const prize = (overrides = {}) => ({
  id: ids.prize,
  category: "TOP_10",
  type: "TOP_RANK",
  target: "PHOTO",
  rankLimit: 10,
  title: "Top 10 Photos",
  description: "Awarded to the 10 highest-ranked photos.",
  icon: "image",
  boost: 5,
  swap: 0,
  key: 1,
  coin: 500,
  isActive: true,
  isDefault: false,
  order: 50,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const prizeDefinitions = [
  prize({ id: ids.topPhotoPrize, category: "TOP_PHOTO", type: "TOP_PHOTO", target: "PHOTO", rankLimit: null, title: "Top Photo", description: "Awarded to the highest-ranked photo in the contest.", icon: "trophy", boost: 10, swap: 1, key: 1, coin: 500, isDefault: true, order: 10 }),
  prize({ id: ids.topPhotographerPrize, category: "TOP_PHOTOGRAPHER", type: "TOP_PHOTOGRAPHER", target: "PHOTOGRAPHER", rankLimit: null, title: "Top Photographer", description: "Awarded to the photographer with the highest total contest score.", icon: "camera", boost: 20, swap: 2, key: 2, coin: 1000, isDefault: true, order: 20 }),
  prize({ id: ids.winnerPrize, category: "WINNER", type: "WINNER", target: "PHOTOGRAPHER", rankLimit: null, title: "Winner", description: "Grand winner award for the contest's highest-ranked photographer.", icon: "medal", boost: 30, swap: 3, key: 3, coin: 1500, order: 30 }),
  prize({ id: ids.ycPickPrize, category: "YC_PICK", type: "YC_PICK", target: "PHOTO", rankLimit: null, title: "YC Pick", description: "Editorial photo selected by Your Capture Award.", icon: "star", boost: 5, swap: 0, key: 1, coin: 250, order: 40 }),
  prize(),
  prize({ id: ids.photographerPrize, target: "PHOTOGRAPHER", title: "Top 10 Photographers", description: "Awarded to the 10 highest-ranked photographers.", icon: "users", boost: 10, swap: 1, key: 2, coin: 1000, order: 60 }),
  prize({ id: ids.top20PhotoPrize, category: "TOP_20", rankLimit: 20, title: "Top 20 Photos", description: "Awarded to the 20 highest-ranked photos.", boost: 4, coin: 300, isDefault: false, order: 70 }),
  prize({ id: ids.top20PhotographerPrize, category: "TOP_20", target: "PHOTOGRAPHER", rankLimit: 20, title: "Top 20 Photographers", description: "Awarded to the 20 highest-ranked photographers.", icon: "users", boost: 8, swap: 1, coin: 600, isDefault: false, order: 80 }),
  prize({ id: ids.top50PhotoPrize, category: "TOP_50", rankLimit: 50, title: "Top 50 Photos", description: "Awarded to the 50 highest-ranked photos.", boost: 3, coin: 150, isDefault: false, order: 90 }),
  prize({ id: ids.top50PhotographerPrize, category: "TOP_50", target: "PHOTOGRAPHER", rankLimit: 50, title: "Top 50 Photographers", description: "Awarded to the 50 highest-ranked photographers.", icon: "users", boost: 6, coin: 300, isDefault: false, order: 100 }),
  prize({ id: ids.top100PhotoPrize, category: "TOP_100", rankLimit: 100, title: "Top 100 Photos", description: "Awarded to the 100 highest-ranked photos.", boost: 2, key: 0, coin: 75, isDefault: false, order: 110 }),
  prize({ id: ids.top100PhotographerPrize, category: "TOP_100", target: "PHOTOGRAPHER", rankLimit: 100, title: "Top 100 Photographers", description: "Awarded to the 100 highest-ranked photographers.", icon: "users", boost: 4, coin: 150, isDefault: false, order: 120 }),
];
const top100PhotoDefinition = prizeDefinitions.find((definition) => definition.id === ids.top100PhotoPrize);
const category = {
  id: ids.category,
  slug: "street-photography",
  name: "Street photography",
  description: null,
  isActive: true,
  order: 10,
  createdAt: now,
  updatedAt: now,
};

const contest = (overrides = {}) => ({
  id: ids.contest,
  title: "Postman Weighted Vote Contest",
  description: "Contest-system integration flow.",
  banner: defaultBanner,
  status: "ACTIVE",
  isMoneyContest: false,
  maxPrize: 0,
  minPrize: 0,
  currency: null,
  entryFeeCoins: 0,
  startDate: now,
  endDate: later,
  startedAt: now,
  endedAt: null,
  finalizedAt: null,
  recurringContestId: null,
  configVersion: 1,
  scoringVersion: 1,
  creatorId: ids.admin,
  categoryId: ids.category,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const recurringContest = (overrides = {}) => ({
  id: ids.recurringContest,
  title: "Postman Weekly Contest",
  description: "Recurring contest integration flow.",
  banner: defaultBanner,
  isMoneyContest: false,
  maxPrize: 0,
  minPrize: 0,
  currency: null,
  entryFeeCoins: 0,
  startDate: "2026-07-23T10:00:00.000Z",
  endDate: "2026-07-23T11:00:00.000Z",
  creatorId: ids.admin,
  categoryId: ids.category,
  status: "ACTIVE",
  recurring: {
    recurringType: "WEEKLY",
    previousOccurrence: null,
    nextOccurrence: "2026-07-23T10:00:00.000Z",
    duration: 3600000,
    timezone: "Asia/Dhaka",
    endsAt: null,
    maxOccurrences: 12,
    generatedOccurrences: 0,
  },
  lastGeneratedContestId: null,
  rules: normalizedRules,
  prizes: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const contestPhoto = {
  id: ids.contestPhoto,
  title: null,
  contestId: ids.contest,
  participantId: ids.participant,
  photoId: ids.userPhoto,
  rank: 0,
  promoted: false,
  promotionExpiresAt: null,
  initialVotes: 0,
  createdAt: now,
  updatedAt: now,
  photo: {
    id: ids.userPhoto,
    url: "https://cdn.example.com/contest-photo.jpg",
    userId: ids.user,
    states: null,
    views: 0,
    labels: [],
    title: null,
    description: null,
    adult: false,
    createdAt: now,
    updatedAt: now,
  },
};

const award = {
  id: ids.award,
  category: "YC_PICK",
  type: "YC_PICK",
  target: "PHOTO",
  rankLimit: null,
  slotKey: "YC_PICK:PHOTO",
  title: "YC Pick",
  description: "Editorial photo selected by Your Capture Award.",
  icon: "star",
  boost: 5,
  swap: 0,
  key: 1,
  coin: 250,
  enabled: true,
  order: 40,
  contestId: ids.contest,
  prizeId: ids.ycPickPrize,
  createdAt: now,
  updatedAt: now,
};

const photoAward = {
  ...award,
  id: ids.photoAward,
  category: "TOP_10",
  type: "TOP_RANK",
  target: "PHOTO",
  rankLimit: 10,
  slotKey: "TOP_RANK:PHOTO",
  title: "Top 10 Photos",
  description: "Awarded to the 10 highest-ranked photos.",
  icon: "image",
  contestAwardId: undefined,
  prizeId: ids.prize,
  coin: 750,
  order: 50,
};

const photographerAward = {
  ...award,
  id: ids.photographerAward,
  category: "TOP_10",
  type: "TOP_RANK",
  target: "PHOTOGRAPHER",
  rankLimit: 10,
  slotKey: "TOP_RANK:PHOTOGRAPHER",
  title: "Top 10 Photographers",
  description: "Awarded to the 10 highest-ranked photographers.",
  icon: "users",
  key: 2,
  boost: 10,
  swap: 1,
  coin: 1000,
  order: 60,
  contestAwardId: undefined,
  prizeId: ids.photographerPrize,
};

delete photoAward.contestAwardId;
delete photographerAward.contestAwardId;
const snapshotAward = (definition, id) => ({
  id,
  category: definition.category,
  type: definition.type,
  target: definition.target,
  rankLimit: definition.rankLimit,
  slotKey: `${definition.type}:${definition.target}`,
  title: definition.title,
  description: definition.description,
  icon: definition.icon,
  boost: definition.boost,
  swap: definition.swap,
  key: definition.key,
  coin: definition.coin,
  enabled: true,
  order: definition.order,
  contestId: ids.contest,
  prizeId: definition.id,
  createdAt: now,
  updatedAt: now,
});
const contestAwards = [
  snapshotAward(prizeDefinitions[0], "670700000000000000000004"),
  snapshotAward(prizeDefinitions[1], "670700000000000000000005"),
  snapshotAward(prizeDefinitions[2], "670700000000000000000006"),
  award,
  photoAward,
  photographerAward,
];
const awardRows = contestAwards.map(({ id, contestId, createdAt, updatedAt, ...row }) => row);
const recurringAwards = contestAwards.map(({ contestId, ...entry }) => ({ ...entry, recurringContestId: ids.recurringContest }));
const updatedRecurringAwards = recurringAwards.map((entry) =>
  entry.type === "YC_PICK" ? { ...entry, coin: 300 } : entry
);

const achievement = {
  id: ids.achievement,
  category: "TOP_10",
  kind: "CONTEST_AWARD",
  type: "TOP_RANK",
  target: "PHOTO",
  rankLimit: 10,
  levelBadge: null,
  levelOrder: null,
  photoId: ids.contestPhoto,
  participantId: ids.participant,
  contestId: ids.contest,
  grantKey: `${ids.contest}:AWARD:TOP_RANK:PHOTO:${ids.contestPhoto}`,
  createdAt: later,
  updatedAt: later,
};

const envelope = (message, data, meta = null) => ({ success: true, message, meta, data });
const jsonBody = (value) => ({ mode: "raw", raw: JSON.stringify(value, null, 2), options: { raw: { language: "json" } } });
const formBody = (entries) => ({
  mode: "formdata",
  formdata: entries.map(([key, value, type = "text", description]) => ({
    key,
    ...(type === "file" ? { type, src: value } : { type, value }),
    ...(description ? { description } : {}),
  })),
});

const auth = (kind) => {
  if (kind === "none") return { type: "noauth" };
  const variable = kind === "admin" ? "adminToken" : kind === "voter" ? "voterToken" : "participantToken";
  return { type: "bearer", bearer: [{ key: "token", value: `{{${variable}}}`, type: "string" }] };
};

const makeUrl = (route, query = []) => {
  const rawQuery = query.length
    ? `?${query.filter((item) => !item.disabled).map((item) => `${item.key}=${item.value}`).join("&")}`
    : "";
  return {
    raw: `{{baseUrl}}${route}${rawQuery}`,
    host: ["{{baseUrl}}"],
    path: route.split("/").filter(Boolean),
    ...(query.length ? { query } : {}),
  };
};

const scriptEvent = (listen, lines) => ({ listen, script: { type: "text/javascript", exec: lines } });
const saveDataField = (variable, expression = "json.data.id") => scriptEvent("test", [
  "const json = pm.response.json();",
  `if (pm.response.code < 300 && ${expression}) pm.collectionVariables.set("${variable}", ${expression});`,
]);

const item = ({
  name,
  method,
  route,
  authKind = "participant",
  body,
  query,
  message,
  data,
  meta = null,
  code = 200,
  description,
  events = [],
}) => {
  const request = {
    method,
    header: body?.mode === "raw" ? [{ key: "Content-Type", value: "application/json" }] : [],
    ...(body ? { body } : {}),
    url: makeUrl(route, query),
    auth: auth(authKind),
    ...(description ? { description } : {}),
  };
  const responseBody = envelope(message, data, meta);
  return {
    name,
    ...(events.length ? { event: events } : {}),
    request,
    response: [{
      name: `Success ${code}`,
      originalRequest: request,
      status: code === 201 ? "Created" : "OK",
      code,
      _postman_previewlanguage: "json",
      header: [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
      cookie: [],
      body: JSON.stringify(responseBody, null, 2),
    }],
  };
};

const dateSetup = scriptEvent("prerequest", [
  "const start = new Date(Date.now() + 5 * 60 * 1000);",
  "const durationMinutes = Number(pm.collectionVariables.get('contestDurationMinutes') || 10);",
  "pm.collectionVariables.set('contestStartDate', start.toISOString());",
  "pm.collectionVariables.set('contestEndDate', new Date(start.getTime() + durationMinutes * 60000).toISOString());",
]);

const recurringDateSetup = scriptEvent("prerequest", [
  "const start = new Date(Date.now() + 24 * 60 * 60 * 1000);",
  "pm.collectionVariables.set('recurringStartDate', start.toISOString());",
  "pm.collectionVariables.set('recurringEndDate', new Date(start.getTime() + 60 * 60 * 1000).toISOString());",
]);

const acceptanceKeys = ["ELIGIBILITY", "COPYRIGHT", "PARTICIPATION"];
const configuredRules = [
  { key: "SUBMISSION_LIMIT", value: 4, enabled: true, order: 10 },
  {
    key: "LEVEL_REQUIREMENTS",
    value: [
      { level: "POPULAR", votes: 2 },
      { level: "SKILLED", votes: 5 },
      { level: "PREMIER", votes: 10 },
      { level: "ELITE", votes: 20 },
      { level: "ALL_STAR", votes: 40 },
    ],
    enabled: true,
    order: 30,
  },
  {
    key: "SUBMISSION_FORMAT",
    value: { mimeTypes: ["image/jpeg"], minWidth: 700, minHeight: 700, maxSizeMB: 25 },
    enabled: true,
    order: 40,
  },
];

const normalizedRules = [
  configuredRules[0],
  {
    key: "SUBMISSION_RULES",
    value: {
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
    enabled: true,
    order: 20,
  },
  configuredRules[1],
  configuredRules[2],
  {
    key: "ELIGIBILITY",
    value: {
      minAge: 18,
      text: "Open to all photographers ages 18 and above. Photos must not contain obscene, provocative, defamatory, sexually explicit, or otherwise objectionable or inappropriate content. Photos deemed inappropriate will be disqualified. Challenge void where prohibited.",
      requiresAcceptance: true,
    },
    enabled: true,
    order: 50,
  },
  {
    key: "COPYRIGHT",
    value: {
      text: "You maintain the copyrights to all photos you submit. You must own all submitted images.",
      requiresOwnership: true,
      requiresAcceptance: true,
    },
    enabled: true,
    order: 60,
  },
  {
    key: "VOTING",
    value: {
      text: "Voting is done by members of the site only. The voting system uses a blind voting method which is designed to keep the voting as fair as possible.",
      membersOnly: true,
      requireContestParticipant: true,
      disallowSelfVote: true,
      blindVoting: true,
    },
    enabled: true,
    order: 70,
  },
  {
    key: "PARTICIPATION",
    value: {
      text: "By entering this challenge you accept the standard Terms of Use.",
      requiresTermsAcceptance: true,
      termsUrl: null,
    },
    enabled: true,
    order: 80,
  },
];

const ruleDefinitions = [
  { key: "SUBMISSION_LIMIT", label: "Submission Limit", icon: "number-circle", inputType: "number", defaultValue: 4, appliesTo: ["PHOTO_UPLOAD", "DISPLAY"], displayOnly: false, order: 10 },
  { key: "SUBMISSION_RULES", label: "Submission Rules", icon: "image-upload", inputType: "object", defaultValue: normalizedRules[1].value, appliesTo: ["PHOTO_UPLOAD", "DISPLAY"], displayOnly: false, order: 20 },
  { key: "LEVEL_REQUIREMENTS", label: "Level Requirements", icon: "level-stars", inputType: "list", defaultValue: [{ level: "POPULAR", votes: 50 }, { level: "SKILLED", votes: 250 }, { level: "PREMIER", votes: 900 }, { level: "ELITE", votes: 1900 }, { level: "ALL_STAR", votes: 5000 }], appliesTo: ["RANKING", "DISPLAY"], displayOnly: false, order: 30 },
  { key: "SUBMISSION_FORMAT", label: "Submission Format", icon: "image-plus", inputType: "object", defaultValue: { mimeTypes: ["image/jpeg"], minWidth: 700, minHeight: 700, maxSizeMB: 25 }, appliesTo: ["PHOTO_UPLOAD", "DISPLAY"], displayOnly: false, order: 40 },
  { key: "ELIGIBILITY", label: "Eligibility", icon: "file-check", inputType: "object", defaultValue: normalizedRules[4].value, appliesTo: ["JOIN", "DISPLAY"], displayOnly: false, order: 50 },
  { key: "COPYRIGHT", label: "Copyright", icon: "copyright", inputType: "object", defaultValue: normalizedRules[5].value, appliesTo: ["JOIN", "PHOTO_UPLOAD", "DISPLAY"], displayOnly: false, order: 60 },
  { key: "VOTING", label: "Voting", icon: "vote", inputType: "object", defaultValue: normalizedRules[6].value, appliesTo: ["VOTING", "DISPLAY"], displayOnly: false, order: 70 },
  { key: "PARTICIPATION", label: "Participation", icon: "user", inputType: "object", defaultValue: normalizedRules[7].value, appliesTo: ["JOIN", "DISPLAY"], displayOnly: false, order: 80 },
];

const effectiveRules = normalizedRules.map((rule, index) => ({
  key: rule.key,
  label: ruleDefinitions[index].label,
  name: ruleDefinitions[index].label,
  icon: ruleDefinitions[index].icon,
  inputType: ruleDefinitions[index].inputType,
  appliesTo: ruleDefinitions[index].appliesTo,
  displayOnly: false,
  enabled: true,
  order: rule.order,
  value: rule.value,
  description: rule.key === "SUBMISSION_LIMIT"
    ? "4 photo submits per participant"
    : rule.key === "LEVEL_REQUIREMENTS"
      ? rule.value.map((entry) => `- ${entry.level.replace("_", " ")} - ${entry.votes} votes`).join("\n")
      : rule.key === "SUBMISSION_FORMAT"
        ? "JPEG, minimum resolution of 700px x 700px, maximum size 25MB"
        : rule.value.text || [rule.value.intro, ...rule.value.disallowed.map((entry) => `- ${entry}`), rule.value.removalNotice].filter(Boolean).join("\n"),
}));

const folders = [];

folders.push({
  name: "00 - Authentication Setup",
  description: "Only the authentication calls required to run the contest workflow. Tokens are captured as collection variables.",
  item: [
    item({
      name: "Admin Sign In",
      method: "POST",
      route: "/auth/admin/signin",
      authKind: "none",
      body: jsonBody({ email: "{{adminEmail}}", password: "{{adminPassword}}", remember_me: false }),
      message: "User sign in successfully",
      data: { user: userDto(ids.admin, "ADMIN"), token: "eyJhbGciOiJIUzI1NiJ9.admin-token" },
      events: [saveDataField("adminToken", "json.data && json.data.token")],
    }),
    item({
      name: "Register Participant",
      method: "POST",
      route: "/auth/register",
      authKind: "none",
      body: jsonBody({
        firstName: "Test",
        lastName: "Participant",
        email: "{{participantEmail}}",
        phone: "+8801700000000",
        dateOfBirth: "1995-01-01T00:00:00.000Z",
        password: "{{participantPassword}}",
        confirmPassword: "{{participantPassword}}",
      }),
      message: "user registered successfully",
      data: { user: userDto(), token: "eyJhbGciOiJIUzI1NiJ9.participant-token" },
      code: 201,
      events: [saveDataField("participantToken", "json.data && json.data.token")],
      description: "Run once for a new email. Use Participant Sign In on later runs.",
    }),
    item({
      name: "Participant Sign In",
      method: "POST",
      route: "/auth/signin",
      authKind: "none",
      body: jsonBody({ email: "{{participantEmail}}", password: "{{participantPassword}}", remember_me: false }),
      message: "User sign in successfully",
      data: { user: userDto(), token: "eyJhbGciOiJIUzI1NiJ9.participant-token" },
      events: [saveDataField("participantToken", "json.data && json.data.token")],
    }),
    item({
      name: "Register Voter",
      method: "POST",
      route: "/auth/register",
      authKind: "none",
      body: jsonBody({
        firstName: "Test",
        lastName: "Voter",
        email: "{{voterEmail}}",
        phone: "+8801700000001",
        dateOfBirth: "1994-01-01T00:00:00.000Z",
        password: "{{voterPassword}}",
        confirmPassword: "{{voterPassword}}",
      }),
      message: "user registered successfully",
      data: { user: { ...userDto(ids.voter), email: "voter@example.com", lastName: "Voter" }, token: "eyJhbGciOiJIUzI1NiJ9.voter-token" },
      code: 201,
      events: [saveDataField("voterToken", "json.data && json.data.token")],
      description: "A second user is required because the default voting rule rejects self-votes.",
    }),
    item({
      name: "Voter Sign In",
      method: "POST",
      route: "/auth/signin",
      authKind: "none",
      body: jsonBody({ email: "{{voterEmail}}", password: "{{voterPassword}}", remember_me: false }),
      message: "User sign in successfully",
      data: { user: { ...userDto(ids.voter), email: "voter@example.com", lastName: "Voter" }, token: "eyJhbGciOiJIUzI1NiJ9.voter-token" },
      events: [saveDataField("voterToken", "json.data && json.data.token")],
    }),
  ],
});

folders.push({
  name: "01 - Rule and Prize Definitions",
  item: [
    item({
      name: "Get Contest Rule Definitions",
      method: "GET",
      route: "/contests/rules/definitions",
      authKind: "admin",
      message: "Contest rule definitions fetched successfully",
      data: ruleDefinitions,
    }),
    item({
      name: "Get Contest Creation Options",
      method: "GET",
      route: "/contests/create-options",
      authKind: "admin",
      message: "Contest creation options fetched successfully",
      data: {
        categories: [category],
        rules: ruleDefinitions,
        prizes: prizeDefinitions,
        supportedImageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/tiff"],
      },
      events: [saveDataField("contestCategoryId", "json.data && json.data.categories && json.data.categories[0] && json.data.categories[0].id")],
    }),
    item({ name: "List Active Prizes", method: "GET", route: "/prizes", authKind: "admin", query: [{ key: "includeInactive", value: "false" }], message: "Prizes fetched successfully", data: prizeDefinitions }),
    item({
      name: "Get Award Definitions",
      method: "GET",
      route: "/prizes/award-definitions",
      authKind: "admin",
      message: "Award definitions fetched successfully",
      data: prizeDefinitions,
      events: [scriptEvent("test", [
        "const definitions = pm.response.json().data || [];",
        "const find = (type, target, rankLimit) => definitions.find(item => item.type === type && item.target === target && (item.rankLimit || null) === rankLimit);",
        "const top10Photo = find('TOP_RANK', 'PHOTO', 10);",
        "const top10Photographer = find('TOP_RANK', 'PHOTOGRAPHER', 10);",
        "const ycPick = find('YC_PICK', 'PHOTO', null);",
        "const top100Photo = find('TOP_RANK', 'PHOTO', 100);",
        "if (top10Photo) pm.collectionVariables.set('top10PhotoPrizeId', top10Photo.id);",
        "if (top10Photographer) pm.collectionVariables.set('top10PhotographerPrizeId', top10Photographer.id);",
        "if (ycPick) pm.collectionVariables.set('ycPickPrizeId', ycPick.id);",
        "if (top100Photo) pm.collectionVariables.set('top100PhotoPrizeId', top100Photo.id);",
      ])],
    }),
    item({ name: "Get Prize", method: "GET", route: "/prizes/{{top10PhotoPrizeId}}", authKind: "admin", message: "Prize fetched successfully", data: prize() }),
    item({
      name: "Update Non-Default Prize",
      method: "PATCH",
      route: "/prizes/{{top100PhotoPrizeId}}",
      authKind: "admin",
      body: jsonBody({ description: "Temporary Postman verification description." }),
      message: "Prize updated successfully",
      data: { ...top100PhotoDefinition, description: "Temporary Postman verification description." },
      description: "Uses a non-default definition so the contest default slots remain unchanged.",
    }),
    item({
      name: "Deactivate Non-Default Prize",
      method: "DELETE",
      route: "/prizes/{{top100PhotoPrizeId}}",
      authKind: "admin",
      message: "Prize deleted successfully",
      data: { ...top100PhotoDefinition, description: "Temporary Postman verification description.", isActive: false },
      description: "Soft-deactivates the Top 100 Photo definition. The following request restores it.",
    }),
    item({
      name: "Reactivate Prize Definition",
      method: "POST",
      route: "/prizes",
      authKind: "admin",
      body: jsonBody({ type: "TOP_RANK", target: "PHOTO", rankLimit: 100, title: "Top 100 Photos", description: "Awarded to the 100 highest-ranked photos.", icon: "image", boost: 2, swap: 0, key: 0, coin: 75, isDefault: false, order: 110 }),
      message: "Prize created successfully",
      data: top100PhotoDefinition,
      code: 201,
      events: [saveDataField("top100PhotoPrizeId")],
      description: "Reactivates the existing inactive identity and restores its seeded defaults, making the administration flow reversible.",
    }),
  ],
});

const contestCreateForm = (recurring) => formBody([
  ["title", recurring ? "Postman Weekly Contest" : "Postman Weighted Vote Contest"],
  ["description", recurring ? "Recurring contest integration flow." : "Contest-system integration flow."],
  ["categoryId", "{{contestCategoryId}}"],
  ["startDate", recurring ? "{{recurringStartDate}}" : "{{contestStartDate}}"],
  ["endDate", recurring ? "{{recurringEndDate}}" : "{{contestEndDate}}"],
  ["recurring", String(recurring)],
  ...(recurring ? [
    ["recurringType", "WEEKLY"],
    ["recurrenceTimezone", "Asia/Dhaka"],
    ["maxOccurrences", "12"],
  ] : []),
  ["isMoneyContest", "false"],
  ["coinRequirement", "false"],
  ["entryFeeCoins", "0"],
  ["awards", JSON.stringify([
    { type: "TOP_PHOTO", target: "PHOTO", value: { boost: 10, key: 1, swap: 1, coin: 500 } },
    { type: "TOP_PHOTOGRAPHER", target: "PHOTOGRAPHER", value: { boost: 20, key: 2, swap: 2, coin: 1000 } },
    { type: "WINNER", target: "PHOTOGRAPHER", value: {} },
    { type: "YC_PICK", target: "PHOTO", value: {} },
    { type: "TOP_RANK", target: "PHOTO", rankLimit: 10, value: { coin: 750 } },
    { type: "TOP_RANK", target: "PHOTOGRAPHER", rankLimit: 10, value: {} },
  ])],
  ["rules", JSON.stringify(configuredRules)],
  ["banner", "{{contestBannerFile}}", "file", "Optional image file. Remove this row when no banner is needed."],
]);

folders.push({
  name: "02 - Contest Lifecycle",
  item: [
    item({
      name: "Create One-Time Contest",
      method: "POST",
      route: "/contests",
      authKind: "admin",
      body: contestCreateForm(false),
      message: "Contest created successfully",
      data: { ...contest({ status: "UPCOMING", startedAt: null }), rules: normalizedRules, awards: awardRows, prizes: awardRows },
      code: 201,
      events: [dateSetup, saveDataField("contestId")],
      description: "The submitted award list is authoritative. This integration contest explicitly selects six slots; omitting awards would use only the Top Photo and Top Photographer defaults.",
    }),
    item({ name: "List Contests by Status", method: "GET", route: "/contests", query: [{ key: "status", value: "ACTIVE" }], message: "contests fetched successfully", data: [contest()] }),
    item({ name: "List All Contests (Admin)", method: "GET", route: "/contests/all", authKind: "admin", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "All contests fetched successfully", data: { contests: [contest()], total: 1, page: 1, limit: 20 } }),
    item({ name: "Get Contest Details", method: "GET", route: "/contests/{{contestId}}", message: "Contest fetched successfully", data: { ...contest(), creator: userDto(ids.admin, "ADMIN"), category, rules: effectiveRules, prizes: contestAwards, awards: contestAwards, totalVotes: 0, finalization: null, awardSelections: [], joined: false } }),
    item({ name: "Update Upcoming Contest", method: "PUT", route: "/contests/{{contestId}}", authKind: "admin", body: jsonBody({ title: "Updated Postman Contest", description: "Updated before activation." }), message: "contest updated successfully", data: contest({ title: "Updated Postman Contest", description: "Updated before activation.", status: "UPCOMING", startedAt: null }) }),
    item({ name: "Get My Active Contests", method: "GET", route: "/contests/my-active-contests", message: "user active contest fetched successfully", data: [{ ...contest(), level_data: { currentLevel: "NEW", totalVotes: 0, nextLevel: { levelName: "AMATEUR", point: 2, displayLevel: "POPULAR" }, exposure_bonus: 100 }, photos: [] }] }),
    item({ name: "Get Effective Contest Rules", method: "GET", route: "/contests/{{contestId}}/rules", message: "Contest rules fetched successfully", data: effectiveRules }),
    item({ name: "Get Contest Awards", method: "GET", route: "/contests/{{contestId}}/prizes", message: "contest prizes fetched successfully", data: contestAwards }),
  ],
});

folders.push({
  name: "03 - Participation and Photos",
  item: [
    item({
      name: "Join Contest as Participant",
      method: "POST",
      route: "/contests/{{contestId}}/join",
      body: jsonBody({ acceptedRuleKeys: acceptanceKeys }),
      message: "user joined a contest successfully",
      data: { contest_id: ids.contest, participant_id: ids.participant },
      events: [scriptEvent("prerequest", ["// Allow the 5-second activation scheduler to claim a newly created contest.", "setTimeout(() => {}, 12000);"]), saveDataField("participantId", "json.data && json.data.participant_id")],
    }),
    item({
      name: "Join Contest as Voter",
      method: "POST",
      route: "/contests/{{contestId}}/join",
      authKind: "voter",
      body: jsonBody({ acceptedRuleKeys: acceptanceKeys }),
      message: "user joined a contest successfully",
      data: { contest_id: ids.contest, participant_id: ids.voterParticipant },
      events: [saveDataField("voterParticipantId", "json.data && json.data.participant_id")],
    }),
    item({
      name: "Upload JPEG Directly to Contest",
      method: "POST",
      route: "/contests/{{contestId}}/upload",
      body: formBody([
        ["photo", "{{contestPhotoFile}}", "file", "JPEG, at least 700x700, and no larger than 25MB for the example rules."],
        ["acceptedRuleKeys", JSON.stringify(acceptanceKeys)],
      ]),
      message: "photo submit to contest successfully",
      data: [contestPhoto],
      events: [scriptEvent("test", [
        "const json = pm.response.json();",
        "if (pm.response.code < 300 && json.data && json.data[0]) {",
        "  pm.collectionVariables.set('contestPhotoId', json.data[0].id);",
        "  pm.collectionVariables.set('userPhotoId', json.data[0].photoId);",
        "}",
      ])],
    }),
    item({ name: "Get Remaining User Photos", method: "GET", route: "/contests/{{contestId}}/user-photos", message: "remaining photos found successfully", data: [{ id: ids.userPhoto, url: "https://cdn.example.com/photo.jpg" }] }),
    item({ name: "Submit Existing User Photo", method: "POST", route: "/contests/{{contestId}}/upload", body: formBody([["photoIds", "{{userPhotoId}}"], ["acceptedRuleKeys", JSON.stringify(acceptanceKeys)]]), message: "photo submit to contest successfully", data: [contestPhoto] }),
    item({ name: "Get Contest Photo Feed", method: "GET", route: "/contests/{{contestId}}/photos", message: "photos fetched successfully", data: [{ id: ids.userPhoto, url: "https://cdn.example.com/contest-photo.jpg", voteCount: 0 }], description: "This endpoint returns user-photo IDs. Use the voting feed endpoint for contest-photo IDs." }),
    item({ name: "Get Photos Available to Vote", method: "GET", route: "/contests/{{contestId}}/photos/vote", authKind: "voter", message: "photos fetched successfully", data: [{ url: "https://cdn.example.com/contest-photo.jpg", id: ids.contestPhoto }], description: "The id returned here is the ContestPhoto ID expected by the vote endpoint." }),
  ],
});

const voteExample = {
  id: ids.vote,
  providerId: ids.voter,
  photoId: ids.contestPhoto,
  contestId: ids.contest,
  type: "Organic",
  power: 1,
  weight: 1,
  createdAt: now,
  updatedAt: now,
};

folders.push({
  name: "04 - Weighted Voting and Rankings",
  item: [
    item({ name: "Vote for One Photo", method: "POST", route: "/votes/{{contestId}}", authKind: "voter", body: jsonBody({ photoId: "{{contestPhotoId}}" }), message: "Vote added successfully", data: voteExample, description: "weight and power are immutable snapshots of the provider's voting_power. A newly registered voter has power 1; a provider provisioned with power 4 produces weight 4. Rankings sum weight, not vote rows." }),
    item({ name: "Vote for Multiple Photos", method: "POST", route: "/votes/{{contestId}}", authKind: "voter", body: jsonBody({ photoIds: ["{{contestPhotoId}}", "{{secondContestPhotoId}}"] }), message: "Votes added successfully", data: [voteExample] }),
    item({ name: "Rank Photos", method: "GET", route: "/contests/{{contestId}}/rank-photos", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "photos fetched successfully", data: { photos: [{ contestPhotoId: ids.contestPhoto, userPhotoId: ids.userPhoto, url: "https://cdn.example.com/contest-photo.jpg", title: null, voteCount: 1, rank: 1, photographer: { id: ids.user, avatar: null, country: null, fullName: "Test Participant" } }], meta: { page: 1, limit: 20, total: 1 } }, description: "Photo ranking is global and does not expose level tabs or accept a level filter." }),
    item({ name: "Rank Photographers", method: "GET", route: "/contests/{{contestId}}/rank-photographer", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }, { key: "level", value: "POPULAR" }], message: "photographer fetched successfully", data: { contestTotalVotes: 1, levelTabs: ["POPULAR", "SKILLED", "PREMIER", "ELITE", "ALL_STAR"], activeLevel: "POPULAR", participants: [{ participantId: ids.participant, rank: 1, level: "POPULAR", user: { id: ids.user, avatar: null, country: null, fullName: "Test Participant", isFollowing: false }, photos: [{ contestPhotoId: ids.contestPhoto, userPhotoId: ids.userPhoto, url: "https://cdn.example.com/contest-photo.jpg", title: null, voteCount: 1 }], totalVotes: 1, levelRank: 1 }], meta: { page: 1, limit: 20, total: 1 } } }),
    item({ name: "Rank YC Picks", method: "GET", route: "/contests/{{contestId}}/rank-yc-picks", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "yc top picks fetched successfully", data: { photos: [], meta: { page: 1, limit: 20, total: 0 }, selectionType: "VOTE_RANKED_FALLBACK" }, description: "YC Pick ranking is global and does not expose level tabs or accept a level filter." }),
  ],
});

const selection = {
  id: ids.selection,
  selectionKey: `${ids.contest}:YC_PICK:PHOTO`,
  contestId: ids.contest,
  contestAwardId: ids.award,
  slotKey: "YC_PICK:PHOTO",
  photoId: ids.contestPhoto,
  participantId: ids.participant,
  selectedById: ids.admin,
  createdAt: now,
  updatedAt: now,
};

folders.push({
  name: "05 - Editorial Selection and Results",
  item: [
    item({
      name: "Find YC Pick Award ID",
      method: "GET",
      route: "/contests/{{contestId}}/prizes",
      message: "contest prizes fetched successfully",
      data: contestAwards,
      events: [scriptEvent("test", [
        "const json = pm.response.json();",
        "const ycPick = Array.isArray(json.data) && json.data.find(item => item.type === 'YC_PICK');",
        "if (ycPick) pm.collectionVariables.set('ycPickAwardId', ycPick.id);",
      ])],
    }),
    item({ name: "Select YC Pick Photo", method: "PUT", route: "/contests/{{contestId}}/awards/{{ycPickAwardId}}/selection", authKind: "admin", body: jsonBody({ photoId: "{{contestPhotoId}}" }), message: "award photo selected successfully", data: selection }),
    item({ name: "Get Award Selections", method: "GET", route: "/contests/{{contestId}}/award-selections", authKind: "admin", message: "contest award selections fetched successfully", data: [selection] }),
    item({
      name: "Get Contest Winners",
      method: "GET",
      route: "/contests/{{contestId}}/winners",
      message: "contest winners fetched successfully",
      data: [{
        id: "674b00000000000000000001",
        grantKey: `${ids.contest}:AWARD:TOP_RANK:PHOTO:${ids.contestPhoto}`,
        contestId: ids.contest,
        contestAwardId: ids.award,
        participantId: ids.participant,
        userId: ids.user,
        photoId: ids.contestPhoto,
        category: "TOP_10",
        kind: "CONTEST_AWARD",
        type: "TOP_RANK",
        target: "PHOTO",
        rankLimit: 10,
        levelBadge: null,
        levelOrder: null,
        rank: 1,
        keyReward: 1,
        boostReward: 1,
        swapReward: 0,
        coinReward: 100,
        status: "COMPLETED",
        error: null,
        processedAt: later,
        createdAt: later,
        updatedAt: later,
        user: { id: ids.user, avatar: null, fullName: "Test Participant", firstName: "Test", lastName: "Participant" },
        photo: { ...contestPhoto, photo: { id: ids.userPhoto, url: "https://cdn.example.com/contest-photo.jpg", title: null } },
      }],
      description: "Available only after the scheduler finalizes an ended contest. Finalization persists rankings, grants rewards once, and creates achievements.",
    }),
  ],
});

folders.push({
  name: "06 - Recurring Contests",
  item: [
    item({
      name: "Create Recurring Contest Template",
      method: "POST",
      route: "/contests",
      authKind: "admin",
      body: contestCreateForm(true),
      message: "Contest created successfully",
      data: { ...recurringContest(), awards: awardRows },
      code: 201,
      events: [recurringDateSetup, saveDataField("recurringContestId")],
    }),
    item({ name: "List Recurring Contests", method: "GET", route: "/recurring-contests", authKind: "admin", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "Recurring contests fetched successfully", data: { recurringContests: [recurringContest()], total: 1, page: 1, limit: 20 } }),
    item({ name: "Get Recurring Contest", method: "GET", route: "/recurring-contests/{{recurringContestId}}", authKind: "admin", message: "Recurring contest fetched successfully", data: { ...recurringContest(), contestAwards: recurringAwards, category } }),
    item({ name: "Update Recurring Contest", method: "PATCH", route: "/recurring-contests/{{recurringContestId}}", authKind: "admin", body: jsonBody({ title: "Updated Weekly Contest", description: "Updated future template." }), message: "Recurring contest updated successfully", data: recurringContest({ title: "Updated Weekly Contest", description: "Updated future template." }) }),
    item({ name: "Update Recurrence Interval", method: "PATCH", route: "/recurring-contests/{{recurringContestId}}/interval", authKind: "admin", body: jsonBody({ recurringType: "MONTHLY", nextOccurrence: "{{recurringStartDate}}", timezone: "Asia/Dhaka", maxOccurrences: 12 }), message: "Recurring contest interval updated successfully", data: recurringContest({ recurring: { recurringType: "MONTHLY", previousOccurrence: now, nextOccurrence: "2026-08-22T10:00:00.000Z", duration: 3600000, timezone: "Asia/Dhaka", endsAt: null, maxOccurrences: 12, generatedOccurrences: 0 } }) }),
    item({ name: "Get Recurring Awards", method: "GET", route: "/recurring-contests/{{recurringContestId}}/awards", authKind: "admin", message: "Recurring contest awards fetched successfully", data: recurringAwards }),
    item({ name: "Replace Recurring Awards", method: "PUT", route: "/recurring-contests/{{recurringContestId}}/awards", authKind: "admin", body: jsonBody({ awards: [{ type: "YC_PICK", target: "PHOTO", value: { coin: 300 } }] }), message: "Recurring contest awards updated successfully", data: [updatedRecurringAwards.find((entry) => entry.type === "YC_PICK")], description: "The submitted list replaces the template award snapshot. Existing generated contests remain unchanged." }),
    item({ name: "Get Generated Contest Instances", method: "GET", route: "/recurring-contests/{{recurringContestId}}/contests", authKind: "admin", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "Generated contests fetched successfully", data: { contests: [contest({ recurringContestId: ids.recurringContest })], total: 1, page: 1, limit: 20 } }),
    item({ name: "Pause Recurring Contest", method: "PATCH", route: "/recurring-contests/{{recurringContestId}}/pause", authKind: "admin", message: "Recurring contest paused successfully", data: recurringContest({ status: "PAUSED" }) }),
    item({ name: "Resume Recurring Contest", method: "PATCH", route: "/recurring-contests/{{recurringContestId}}/resume", authKind: "admin", message: "Recurring contest resumed successfully", data: recurringContest({ status: "ACTIVE", recurring: { recurringType: "WEEKLY", previousOccurrence: now, nextOccurrence: "2026-07-29T10:00:00.000Z", duration: 3600000 } }) }),
    item({ name: "End Recurring Contest", method: "PATCH", route: "/recurring-contests/{{recurringContestId}}/end", authKind: "admin", message: "Recurring contest ended successfully", data: recurringContest({ status: "ENDED" }), description: "Destructive lifecycle action: ended templates no longer generate occurrences." }),
  ],
});

const achievementMeta = { page: 1, limit: 20, total: 1 };
folders.push({
  name: "07 - Contest Achievements",
  item: [
    item({ name: "Get My Achievements", method: "GET", route: "/achievements", query: [{ key: "type", value: "TOP_10" }, { key: "page", value: "1" }, { key: "limit", value: "20" }], message: "user achievements fetched!", data: [{ ...achievement, contest: { id: ids.contest, title: "Postman Weighted Vote Contest", banner: null } }], meta: achievementMeta }),
    item({ name: "Get User Achievements", method: "GET", route: "/achievements/users/{{participantUserId}}", authKind: "none", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "Contest achievement fetched successfully", data: [{ ...achievement, contest: { id: ids.contest, title: "Postman Weighted Vote Contest", banner: null } }], meta: achievementMeta }),
    item({ name: "Get Contest Achievements", method: "GET", route: "/achievements/contests/{{contestId}}", authKind: "none", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "Contest achievement fetched successfully", data: [{ ...achievement, photo: { photo: { id: ids.userPhoto, url: "https://cdn.example.com/contest-photo.jpg" } }, participant: { user: userDto() } }], meta: achievementMeta }),
    item({ name: "Get My Photo Achievements", method: "GET", route: "/achievements/photos/{{userPhotoId}}", message: "photo achievements fetched successfully", data: [achievement] }),
    item({ name: "Get All Photo Achievements", method: "GET", route: "/achievements/photos", authKind: "none", query: [{ key: "page", value: "1" }, { key: "limit", value: "20" }], message: "photo achievements fetched successfully", data: [{ ...achievement, contest: { id: ids.contest, title: "Postman Weighted Vote Contest", banner: null }, photo: { id: ids.contestPhoto, photo: { id: ids.userPhoto, url: "https://cdn.example.com/contest-photo.jpg", title: null } }, participant: { user: { id: ids.user, fullName: "Test Participant", avatar: null } } }], meta: achievementMeta }),
  ],
});

folders.push({
  name: "08 - Store-Powered Contest Actions",
  description: "These requests require the participant store to contain the corresponding boost, swap, or key item.",
  item: [
    item({ name: "Promote Contest Photo", method: "POST", route: "/contests/photos/promote", body: jsonBody({ contestId: "{{contestId}}", photoId: "{{contestPhotoId}}" }), message: "photo promoted successfully", data: { message: `Contest photo with ID ${ids.contestPhoto} has been promoted until 2026-07-22T10:30:00.000Z` } }),
    item({ name: "Trade Contest Photo", method: "POST", route: "/contests/trade", body: formBody([["contestId", "{{contestId}}"], ["contestPhotoId", "{{contestPhotoId}}"], ["newPhotoId", "{{replacementUserPhotoId}}"], ["tradePhoto", "{{replacementPhotoFile}}", "file"]]), message: "trade a photo successfully", data: { ...contestPhoto, initialVotes: 1 } }),
    item({ name: "Charge Contest Photo", method: "POST", route: "/contests/charge", body: jsonBody({ contestId: "{{contestId}}", contestPhotoId: "{{contestPhotoId}}" }), message: "photo charged successfully", data: { id: ids.participant, status: "ACTIVE", contestId: ids.contest, userId: ids.user, memberId: null, level: "AMATEUR", rank: 1, exposure_bonus: 100, createdAt: now, updatedAt: now } }),
  ],
});

folders.push({
  name: "09 - Cleanup (Destructive)",
  item: [
    item({ name: "Delete Contest Photo", method: "DELETE", route: "/contests/{{contestId}}/photos/{{contestPhotoId}}", message: "photo deleted successfully", data: "Contest upload deleted successfully" }),
    item({ name: "Delete Contest", method: "DELETE", route: "/contests/{{contestId}}", authKind: "admin", message: "Contest deleted successfully", data: null }),
  ],
});

const contractTests = scriptEvent("test", [
  "const contentType = pm.response.headers.get('Content-Type') || '';",
  "if (contentType.includes('application/json')) {",
  "  const body = pm.response.json();",
  "  if (pm.response.code < 400) {",
  "    pm.test('Success response has the exact API envelope', () => {",
  "      pm.expect(body).to.have.all.keys('success', 'message', 'meta', 'data');",
  "      pm.expect(body.success).to.eql(true);",
  "      pm.expect(body).not.to.have.property('statusCode');",
  "    });",
  "  } else {",
  "    pm.test('Error response has the API error envelope', () => {",
  "      pm.expect(body).to.include.keys('success', 'message', 'errorSources', 'err', 'stack');",
  "      pm.expect(body.success).to.eql(false);",
  "    });",
  "  }",
  "}",
]);

const collection = {
  info: {
    _postman_id: "your-capture-award-contest-system-v1",
    name: "Your Capture Award - Contest System",
    description: [
      "Source-verified Postman collection for the contest subsystem.",
      "",
      "Coverage: authentication setup, contest creation/lifecycle, recurring contests, rules, prize definitions, photo submission, weighted voting, rankings, YC Pick selection, finalization results, achievements, and contest store actions.",
      "",
      "Success responses exactly follow src/shared/ApiResponse.ts: success, message, meta, data. statusCode is the HTTP status and is not included in the JSON body.",
      "",
      "Dynamic IDs, timestamps, URLs, tokens, ordering, and database records vary at runtime. Example responses use representative values while preserving the exact envelope and source-returned field names.",
    ].join("\n"),
    schema,
  },
  auth: auth("participant"),
  event: [contractTests],
  variable: [
    { key: "baseUrl", value: "http://localhost:5003/api/v1", type: "string" },
    { key: "adminEmail", value: "admin@example.com", type: "string" },
    { key: "adminPassword", value: "change-me", type: "string" },
    { key: "participantEmail", value: "participant@example.com", type: "string" },
    { key: "participantPassword", value: "Password123!", type: "string" },
    { key: "voterEmail", value: "voter@example.com", type: "string" },
    { key: "voterPassword", value: "Password123!", type: "string" },
    { key: "adminToken", value: "", type: "string" },
    { key: "participantToken", value: "", type: "string" },
    { key: "voterToken", value: "", type: "string" },
    { key: "contestDurationMinutes", value: "10", type: "string" },
    { key: "contestStartDate", value: now, type: "string" },
    { key: "contestEndDate", value: later, type: "string" },
    { key: "recurringStartDate", value: "2026-08-22T10:00:00.000Z", type: "string" },
    { key: "recurringEndDate", value: "2026-08-22T11:00:00.000Z", type: "string" },
    { key: "contestId", value: ids.contest, type: "string" },
    { key: "recurringContestId", value: ids.recurringContest, type: "string" },
    { key: "contestCategoryId", value: ids.category, type: "string" },
    { key: "participantUserId", value: ids.user, type: "string" },
    { key: "participantId", value: ids.participant, type: "string" },
    { key: "voterParticipantId", value: ids.voterParticipant, type: "string" },
    { key: "top10PhotoPrizeId", value: ids.prize, type: "string" },
    { key: "top10PhotographerPrizeId", value: ids.photographerPrize, type: "string" },
    { key: "ycPickPrizeId", value: ids.ycPickPrize, type: "string" },
    { key: "top100PhotoPrizeId", value: ids.top100PhotoPrize, type: "string" },
    { key: "ycPickAwardId", value: ids.award, type: "string" },
    { key: "contestPhotoId", value: ids.contestPhoto, type: "string" },
    { key: "secondContestPhotoId", value: "66e500000000000000000002", type: "string" },
    { key: "userPhotoId", value: ids.userPhoto, type: "string" },
    { key: "replacementUserPhotoId", value: "66d400000000000000000002", type: "string" },
    { key: "contestBannerFile", value: "", type: "string" },
    { key: "contestPhotoFile", value: "", type: "string" },
    { key: "replacementPhotoFile", value: "", type: "string" },
  ],
  item: folders,
};

const expectedContestRoutes = [
  "POST /contests", "GET /contests", "GET /contests/all", "GET /contests/my-active-contests",
  "GET /contests/rules/definitions", "GET /contests/create-options", "POST /contests/photos/promote", "POST /contests/trade",
  "POST /contests/charge", "GET /contests/{{contestId}}/photos", "GET /contests/{{contestId}}/photos/vote",
  "GET /contests/{{contestId}}/rules", "GET /contests/{{contestId}}/prizes", "GET /contests/{{contestId}}/winners",
  "GET /contests/{{contestId}}/award-selections", "PUT /contests/{{contestId}}/awards/{{ycPickAwardId}}/selection",
  "GET /contests/{{contestId}}/user-photos", "GET /contests/{{contestId}}/rank-photos",
  "GET /contests/{{contestId}}/rank-photographer", "GET /contests/{{contestId}}/rank-yc-picks",
  "DELETE /contests/{{contestId}}/photos/{{contestPhotoId}}", "POST /contests/{{contestId}}/upload",
  "GET /contests/{{contestId}}", "PUT /contests/{{contestId}}", "DELETE /contests/{{contestId}}",
  "POST /contests/{{contestId}}/join",
  "GET /prizes/award-definitions", "POST /prizes", "GET /prizes", "GET /prizes/{{top10PhotoPrizeId}}",
  "PATCH /prizes/{{top100PhotoPrizeId}}", "DELETE /prizes/{{top100PhotoPrizeId}}",
  "GET /recurring-contests", "PATCH /recurring-contests/{{recurringContestId}}/interval",
  "PATCH /recurring-contests/{{recurringContestId}}/pause", "PATCH /recurring-contests/{{recurringContestId}}/resume",
  "PATCH /recurring-contests/{{recurringContestId}}/end", "GET /recurring-contests/{{recurringContestId}}/contests",
  "GET /recurring-contests/{{recurringContestId}}/awards", "PUT /recurring-contests/{{recurringContestId}}/awards",
  "GET /recurring-contests/{{recurringContestId}}", "PATCH /recurring-contests/{{recurringContestId}}",
  "POST /votes/{{contestId}}", "GET /achievements", "GET /achievements/users/{{participantUserId}}",
  "GET /achievements/photos/{{userPhotoId}}", "GET /achievements/contests/{{contestId}}", "GET /achievements/photos",
];

const requests = [];
const collectRequests = (entries) => entries.forEach((entry) => {
  if (entry.request) requests.push(entry);
  if (entry.item) collectRequests(entry.item);
});
collectRequests(collection.item);

const actualRoutes = new Set(requests.map((entry) =>
  `${entry.request.method} /${entry.request.url.path.join("/")}`
));
const missingRoutes = expectedContestRoutes.filter((route) => !actualRoutes.has(route));
if (missingRoutes.length) {
  throw new Error(`Collection is missing contest routes:\n${missingRoutes.join("\n")}`);
}

requests.forEach((entry) => {
  if (!entry.response || entry.response.length === 0) {
    throw new Error(`${entry.name} has no saved response example`);
  }
  entry.response.forEach((response) => {
    const body = JSON.parse(response.body);
    const keys = Object.keys(body).sort();
    if (response.code < 400 && JSON.stringify(keys) !== JSON.stringify(["data", "message", "meta", "success"])) {
      throw new Error(`${entry.name} has an invalid success envelope: ${keys.join(", ")}`);
    }
    if (Object.prototype.hasOwnProperty.call(body, "statusCode")) {
      throw new Error(`${entry.name} incorrectly includes statusCode in the JSON body`);
    }
  });
});

const rankingRequest = (suffix) => requests.find((entry) =>
  entry.request.url.path.join("/").endsWith(suffix)
);
const globalRankingRequests = [rankingRequest("rank-photos"), rankingRequest("rank-yc-picks")];

globalRankingRequests.forEach((entry) => {
  if (!entry) throw new Error("A global ranking request is missing");
  if ((entry.request.url.query || []).some((query) => query.key === "level")) {
    throw new Error(`${entry.name} must not expose a level filter`);
  }
  const data = JSON.parse(entry.response[0].body).data;
  if ("levelTabs" in data || "activeLevel" in data) {
    throw new Error(`${entry.name} must not expose photographer level tabs`);
  }
});

const photographerRankingRequest = rankingRequest("rank-photographer");
if (!photographerRankingRequest) throw new Error("Rank Photographers request is missing");
const photographerQuery = photographerRankingRequest.request.url.query || [];
const photographerData = JSON.parse(photographerRankingRequest.response[0].body).data;
if (!photographerQuery.some((query) => query.key === "level") || !Array.isArray(photographerData.levelTabs)) {
  throw new Error("Rank Photographers must expose the level filter and level tabs");
}

const prizeDefinitionsRequest = requests.find((entry) => entry.name === "Get Award Definitions");
if (!prizeDefinitionsRequest) throw new Error("Get Award Definitions request is missing");
const savedPrizeDefinitions = JSON.parse(prizeDefinitionsRequest.response[0].body).data;
if (savedPrizeDefinitions.length !== 12 || savedPrizeDefinitions.filter((prize) => prize.isDefault).length !== 2) {
  throw new Error("Prize catalog must contain 12 active definitions and 2 contest defaults");
}
for (const rankLimit of [10, 20, 50, 100]) {
  for (const target of ["PHOTO", "PHOTOGRAPHER"]) {
    if (!savedPrizeDefinitions.some((prize) => prize.type === "TOP_RANK" && prize.target === target && prize.rankLimit === rankLimit)) {
      throw new Error(`Prize catalog is missing TOP_${rankLimit} ${target}`);
    }
  }
}

const createContestRequest = requests.find((entry) => entry.name === "Create One-Time Contest");
if (!createContestRequest) throw new Error("Create One-Time Contest request is missing");
const createdAwards = JSON.parse(createContestRequest.response[0].body).data.awards;
if (createdAwards.length !== 6 || new Set(createdAwards.map((award) => award.slotKey)).size !== 6) {
  throw new Error("Contest creation must snapshot exactly one award per default slot");
}
const overriddenPhotoAward = createdAwards.find((award) => award.slotKey === "TOP_RANK:PHOTO");
if (!overriddenPhotoAward || overriddenPhotoAward.coin !== 750) {
  throw new Error("Contest-specific prize override is missing from the saved response");
}

fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
console.log(`Generated ${outputPath} with ${requests.length} requests and ${expectedContestRoutes.length} covered contest routes`);
