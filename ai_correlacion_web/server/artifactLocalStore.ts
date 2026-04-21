import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const WIN_WORK_ROOT = join("E:\\", "contradef-tmp", "analysis");

function preferredArtifactRoot() {
  return process.platform === "win32" ? WIN_WORK_ROOT : join(tmpdir(), "contradef-analysis");
}

export function jobArtifactsDirectory(jobId: string) {
  return resolve(join(preferredArtifactRoot(), jobId, "artifacts"));
}

export function assertSafeRelativeArtifactPath(relativePath: string) {
  if (!relativePath || relativePath.trim() !== relativePath) {
    throw new Error("Caminho de artefato inválido.");
  }
  if (relativePath.includes("..") || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new Error("Caminho de artefato não pode conter segmentos '..'.");
  }
}

export function resolveLocalArtifactPath(jobId: string, relativePath: string) {
  assertSafeRelativeArtifactPath(relativePath);
  const root = jobArtifactsDirectory(jobId);
  const target = normalize(join(root, ...relativePath.split(/[/\\]/)));
  if (!target.startsWith(root)) {
    throw new Error("Caminho de artefato fora do diretório do job.");
  }
  return target;
}

export async function localArtifactExists(jobId: string, relativePath: string) {
  try {
    await access(resolveLocalArtifactPath(jobId, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function persistJobArtifactBuffer(jobId: string, relativePath: string, buffer: Buffer) {
  const target = resolveLocalArtifactPath(jobId, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

export async function copyTempFileToLocalArtifact(jobId: string, relativePath: string, tempFilePath: string) {
  const target = resolveLocalArtifactPath(jobId, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await pipeline(createReadStream(tempFilePath), createWriteStream(target));
}

export async function localArtifactByteSize(jobId: string, relativePath: string) {
  const st = await stat(resolveLocalArtifactPath(jobId, relativePath));
  return st.size;
}
