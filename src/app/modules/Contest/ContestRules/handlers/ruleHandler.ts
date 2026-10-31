// What a contest rule can do. To add a rule:
//   1. add it to contestRule.definitions.ts and contestRule.validation.ts
//   2. add a handler file in this folder
//   3. list the handler in handlers/index.ts
// A rule only implements the parts it needs. A rule with no onUpload or
// acceptance is shown to users but not enforced.

export type UploadContext = {
  contestId: string;
  participantId?: string;
  files: Express.Multer.File[];
  photoIds: string[];
};

export type RuleHandler<TValue = any> = {
  // The text shown to users for this rule. Rules without one show value.text.
  summarize?(value: TValue): string;
  // Runs when a photo is submitted. Throws ApiError to reject it.
  onUpload?(context: UploadContext, value: TValue): Promise<void>;
  // Rules a user must accept before joining.
  acceptance?: {
    isRequired(value: TValue): boolean;
    errorMessage: string;
  };
};
