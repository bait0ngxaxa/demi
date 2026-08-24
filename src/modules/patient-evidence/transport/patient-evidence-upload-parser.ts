import Busboy from "@fastify/busboy";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  PATIENT_EVIDENCE_CAPTION_MAX_LENGTH,
} from "../schemas/patient-evidence-schemas";
import { NORMALIZED_UPLOAD_MAX_BYTES } from "../policies/patient-evidence-image-policy";

export const PATIENT_EVIDENCE_MULTIPART_OVERHEAD_BYTES = 128 * 1024;
export const PATIENT_EVIDENCE_MAX_MULTIPART_BYTES =
  NORMALIZED_UPLOAD_MAX_BYTES + PATIENT_EVIDENCE_MULTIPART_OVERHEAD_BYTES;

const PATIENT_EVIDENCE_MULTIPART_FIELD_BYTES = 2 * 1024;
const PATIENT_EVIDENCE_MULTIPART_HEADER_BYTES = 16 * 1024;
const PATIENT_EVIDENCE_MULTIPART_HEADER_PAIRS = 8;
const PATIENT_EVIDENCE_MULTIPART_STREAM_HIGH_WATER_MARK = 16 * 1024;

export type PatientEvidenceMultipartErrorReason =
  | "INVALID_MULTIPART"
  | "REQUEST_TOO_LARGE"
  | "FILE_TOO_LARGE";

export class PatientEvidenceMultipartError extends Error {
  readonly reason: PatientEvidenceMultipartErrorReason;

  constructor(reason: PatientEvidenceMultipartErrorReason) {
    super("Patient evidence multipart input is invalid");
    this.name = "PatientEvidenceMultipartError";
    this.reason = reason;
  }
}

export type PatientEvidenceMultipartInput = {
  bytes: Uint8Array;
  declaredMediaType: string;
  caption: string | null;
};

class RequestBodyLimitTransform extends Transform {
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {
    super({
      readableHighWaterMark: PATIENT_EVIDENCE_MULTIPART_STREAM_HIGH_WATER_MARK,
      writableHighWaterMark: PATIENT_EVIDENCE_MULTIPART_STREAM_HIGH_WATER_MARK,
    });
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    if (chunk.byteLength > this.maxBytes - this.totalBytes) {
      callback(new PatientEvidenceMultipartError("REQUEST_TOO_LARGE"));
      return;
    }

    this.totalBytes += chunk.byteLength;
    callback(null, chunk);
  }
}

function createParser(contentType: string): ReturnType<typeof Busboy> {
  try {
    return Busboy({
      headers: { "content-type": contentType },
      highWaterMark: PATIENT_EVIDENCE_MULTIPART_STREAM_HIGH_WATER_MARK,
      fileHwm: PATIENT_EVIDENCE_MULTIPART_STREAM_HIGH_WATER_MARK,
      limits: {
        fieldSize: PATIENT_EVIDENCE_MULTIPART_FIELD_BYTES,
        fields: 1,
        fileSize: NORMALIZED_UPLOAD_MAX_BYTES,
        files: 1,
        parts: 2,
        headerPairs: PATIENT_EVIDENCE_MULTIPART_HEADER_PAIRS,
        headerSize: PATIENT_EVIDENCE_MULTIPART_HEADER_BYTES,
      },
    });
  } catch {
    throw new PatientEvidenceMultipartError("INVALID_MULTIPART");
  }
}

async function* readRequestBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  registerCancel: (cancel: () => Promise<void>) => void,
): AsyncGenerator<Buffer, void, unknown> {
  const reader = body.getReader();
  let totalBytes = 0;
  const cancel = async (): Promise<void> => {
    try {
      await reader.cancel();
    } catch {
      // The request source may already be closed after a parser failure.
    }
  };

  registerCancel(cancel);

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        return;
      }

      if (result.value.byteLength > maxBytes - totalBytes) {
        throw new PatientEvidenceMultipartError("REQUEST_TOO_LARGE");
      }

      totalBytes += result.value.byteLength;
      yield Buffer.from(
        result.value.buffer,
        result.value.byteOffset,
        result.value.byteLength,
      );
    }
  } finally {
    await cancel();
    reader.releaseLock();
  }
}

export async function parsePatientEvidenceMultipart(
  request: Request,
): Promise<PatientEvidenceMultipartInput> {
  const body = request.body;
  const contentType = request.headers.get("content-type");

  if (!body || !contentType) {
    throw new PatientEvidenceMultipartError("INVALID_MULTIPART");
  }

  const parser = createParser(contentType);
  const fileChunks: Buffer[] = [];
  let fileByteSize = 0;
  let declaredMediaType: string | undefined;
  let hasFile = false;
  let caption: string | null = null;
  let hasCaption = false;
  let parserFailure: PatientEvidenceMultipartError | null = null;
  let bodySource: Readable | undefined;
  let cancelBody: (() => Promise<void>) | undefined;

  const failParser = (reason: PatientEvidenceMultipartErrorReason): void => {
    if (parserFailure) {
      return;
    }

    parserFailure = new PatientEvidenceMultipartError(reason);
    parser.destroy(parserFailure);
    void cancelBody?.();
    bodySource?.destroy(parserFailure);
  };

  parser.on("file", (fieldName, file, _filename, _transferEncoding, mediaType) => {
    if (fieldName !== "file" || hasFile) {
      file.resume();
      failParser("INVALID_MULTIPART");
      return;
    }

    hasFile = true;
    declaredMediaType = mediaType;

    file.on("data", (chunk: Buffer) => {
      if (parserFailure) {
        return;
      }

      const remainingBytes = NORMALIZED_UPLOAD_MAX_BYTES - fileByteSize;

      if (chunk.byteLength > remainingBytes) {
        if (remainingBytes > 0) {
          fileChunks.push(chunk.subarray(0, remainingBytes));
          fileByteSize += remainingBytes;
        }
        failParser("FILE_TOO_LARGE");
        return;
      }

      fileChunks.push(chunk);
      fileByteSize += chunk.byteLength;
    });
    file.on("limit", () => failParser("FILE_TOO_LARGE"));
    file.on("end", () => {
      if (file.truncated) {
        failParser("FILE_TOO_LARGE");
      }
    });
  });

  parser.on(
    "field",
    (fieldName, value, fieldNameTruncated, valueTruncated) => {
      if (
        fieldName !== "caption" ||
        hasCaption ||
        fieldNameTruncated ||
        valueTruncated ||
        value.length > PATIENT_EVIDENCE_CAPTION_MAX_LENGTH
      ) {
        failParser("INVALID_MULTIPART");
        return;
      }

      hasCaption = true;
      caption = value;
    },
  );

  parser.on("filesLimit", () => failParser("INVALID_MULTIPART"));
  parser.on("fieldsLimit", () => failParser("INVALID_MULTIPART"));
  parser.on("partsLimit", () => failParser("INVALID_MULTIPART"));

  try {
    bodySource = Readable.from(
      readRequestBody(body, PATIENT_EVIDENCE_MAX_MULTIPART_BYTES, (cancel) => {
        cancelBody = cancel;
      }),
      {
        highWaterMark: PATIENT_EVIDENCE_MULTIPART_STREAM_HIGH_WATER_MARK,
      },
    );

    await pipeline(
      bodySource,
      new RequestBodyLimitTransform(PATIENT_EVIDENCE_MAX_MULTIPART_BYTES),
      parser,
    );
  } catch (error: unknown) {
    if (parserFailure) {
      throw parserFailure;
    }

    if (error instanceof PatientEvidenceMultipartError) {
      throw error;
    }

    throw new PatientEvidenceMultipartError("INVALID_MULTIPART");
  }

  if (parserFailure) {
    throw parserFailure;
  }

  if (!hasFile || declaredMediaType === undefined) {
    throw new PatientEvidenceMultipartError("INVALID_MULTIPART");
  }

  return {
    bytes: Buffer.concat(fileChunks, fileByteSize),
    declaredMediaType,
    caption,
  };
}
