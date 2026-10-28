// Unit tests: which files the upload endpoint accepts (name AND content).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDocumentType, extensionOf } from "../../src/modules/uploads/upload.middleware.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = Buffer.from("%PDF-1.7\n...");

test("extensionOf: lower-cases and maps aliases", () => {
  assert.equal(extensionOf("Diagram.JPEG"), "jpg");
  assert.equal(extensionOf("notes.markdown"), "md");
  assert.equal(extensionOf("archive.tar.gz"), "gz");
  assert.equal(extensionOf("no-extension"), "");
});

test("accepted: real PDF, PNG, JPEG, Markdown and text", () => {
  assert.deepEqual(detectDocumentType("spec.pdf", PDF), { ok: true, ext: "pdf", mimeType: "application/pdf" });
  assert.deepEqual(detectDocumentType("arch.PNG", PNG), { ok: true, ext: "png", mimeType: "image/png" });
  assert.deepEqual(detectDocumentType("photo.jpeg", JPEG), { ok: true, ext: "jpg", mimeType: "image/jpeg" });
  assert.deepEqual(detectDocumentType("adr-001.md", Buffer.from("# ADR 1\nUse MongoDB.")), { ok: true, ext: "md", mimeType: "text/markdown" });
  assert.deepEqual(detectDocumentType("notes.txt", Buffer.from("héllo")), { ok: true, ext: "txt", mimeType: "text/plain" });
});

test("rejected: unsupported extensions, empty files and content that does not match the extension", () => {
  assert.deepEqual(detectDocumentType("tool.exe", Buffer.from("MZ")), { ok: false, reason: "unsupported_type" });
  assert.deepEqual(detectDocumentType("page.html", Buffer.from("<script>")), { ok: false, reason: "unsupported_type" });
  assert.deepEqual(detectDocumentType("empty.md", Buffer.alloc(0)), { ok: false, reason: "empty" });
  assert.deepEqual(detectDocumentType("fake.pdf", Buffer.from("just text")), { ok: false, reason: "content_mismatch" });
  assert.deepEqual(detectDocumentType("fake.png", JPEG), { ok: false, reason: "content_mismatch" });
  assert.deepEqual(detectDocumentType("binary.txt", Buffer.from([0x68, 0x00, 0x69])), { ok: false, reason: "content_mismatch" }, "NUL byte");
  assert.deepEqual(detectDocumentType("latin1.txt", Buffer.from([0xff, 0xfe, 0x41])), { ok: false, reason: "content_mismatch" }, "not UTF-8");
});
