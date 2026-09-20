import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { PutObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";

process.env.DO_SPACE_BUCKET = process.env.DO_SPACE_BUCKET || "test-bucket";
process.env.DO_SPACE_ORIGIN_ENDPOINT = process.env.DO_SPACE_ORIGIN_ENDPOINT || "https://cdn.test";

import { S3StreamStorage } from "./fileUploader";

type SentCommand = { name: string; input: any };

const createStubClient = (sent: SentCommand[]) => {
  const client: any = {
    config: {
      requestChecksumCalculation: () => Promise.resolve("WHEN_SUPPORTED"),
      forcePathStyle: true,
      // Short-circuits the SDK's endpoint resolution, which is the only part of
      // a real client the uploader touches outside `send`.
      endpoint: async () => ({
        protocol: "https:",
        hostname: "spaces.test",
        path: "/",
      }),
    },
    destroy: () => undefined,
    send: async (command: any) => {
      const name = command.constructor.name;
      // The SDK streams the body lazily; drain it so byte accounting is exercised.
      if (command.input?.Body && typeof command.input.Body.on === "function") {
        await new Promise<void>((resolve, reject) => {
          command.input.Body.on("data", () => undefined);
          command.input.Body.on("end", resolve);
          command.input.Body.on("error", reject);
        });
      }
      sent.push({ name, input: command.input });

      if (command instanceof CreateMultipartUploadCommand) return { UploadId: "upload-1" };
      if (command instanceof UploadPartCommand) return { ETag: '"part"' };
      if (command instanceof CompleteMultipartUploadCommand) return { ETag: '"done"' };
      if (command instanceof PutObjectCommand) return { ETag: '"object"' };
      if (command instanceof DeleteObjectCommand) return {};
      return {};
    },
  };
  return client;
};

const handleFile = (storage: S3StreamStorage, file: any) =>
  new Promise<any>((resolve, reject) => {
    storage._handleFile({} as any, file, (error?: unknown, info?: any) => {
      if (error) reject(error);
      else resolve(info);
    });
  });

const makeFile = (chunks: Buffer[]) => ({
  fieldname: "photo",
  originalname: "sunset.JPEG",
  mimetype: "image/jpeg",
  stream: Readable.from(chunks),
});

test("streams the request body to object storage without holding the file in memory", async () => {
  const sent: SentCommand[] = [];
  const storage = new S3StreamStorage("captureaward", () => createStubClient(sent));
  // Two chunks well past the header sample so the retained buffer stays capped.
  const payload = [Buffer.alloc(200 * 1024, 1), Buffer.alloc(300 * 1024, 2)];

  const info = await handleFile(storage, makeFile(payload));

  assert.equal(info.size, 500 * 1024, "reports the full streamed byte count");
  assert.equal(info.bucket, "test-bucket");
  assert.ok(info.key.startsWith("captureaward/"), `unexpected key ${info.key}`);
  assert.ok(info.key.endsWith(".JPEG"), "keeps the original extension");
  assert.equal(info.location, `https://cdn.test/${info.key}`);

  const upload = sent.find((command) => command.name === "PutObjectCommand" || command.name === "CreateMultipartUploadCommand");
  assert.ok(upload, "the object was uploaded");
  assert.equal(upload.input.ContentType, "image/jpeg");
  assert.equal(upload.input.ACL, "public-read");
});

test("retains only a bounded header sample for image validation", async () => {
  const sent: SentCommand[] = [];
  const storage = new S3StreamStorage("captureaward", () => createStubClient(sent));
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const payload = [header, Buffer.alloc(4 * 1024 * 1024, 7)];

  const info = await handleFile(storage, makeFile(payload));

  assert.equal(info.size, header.length + 4 * 1024 * 1024);
  // The whole file is 4MB but validation only ever needs the leading bytes.
  assert.ok(
    info.headerBuffer.length <= 128 * 1024,
    `header sample grew to ${info.headerBuffer.length} bytes`
  );
  assert.deepEqual(info.headerBuffer.subarray(0, 4), header, "keeps the real file header");
});

test("a failed upload surfaces the error instead of reporting a stored file", async () => {
  const storage = new S3StreamStorage("captureaward", () => {
    const client: any = createStubClient([]);
    client.send = async () => { throw new Error("spaces unavailable"); };
    return client;
  });

  await assert.rejects(
    handleFile(storage, makeFile([Buffer.alloc(1024, 3)])),
    /spaces unavailable/
  );
});

test("removing a file that was never streamed is a no-op", async () => {
  const storage = new S3StreamStorage("captureaward", () => createStubClient([]));

  // Multer calls `_removeFile` for every file it is abandoning, including ones
  // a different engine stored. Without a key there is nothing to delete, and it
  // must not fail the request that is already unwinding.
  await new Promise<void>((resolve, reject) => {
    storage._removeFile({} as any, { originalname: "x.jpg" } as any, (error) =>
      error ? reject(error) : resolve()
    );
  });
});
