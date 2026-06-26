import { readFile } from "node:fs/promises";
export async function resolveInput(opts: {
  message?: string;
  file?: string;
  stdin?: boolean;
}): Promise<string> {
  if (opts.message?.trim()) {
    return opts.message.trim();
  }

  if (opts.file) {
    const text = await readFile(opts.file, "utf8");
    const trimmed = text.trim();
    if (!trimmed) throw new Error(`Input file is empty: ${opts.file}`);
    return trimmed;
  }

  if (opts.stdin) {
    if (process.stdin.isTTY) {
      throw new Error("--stdin set but no piped input on stdin.");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const trimmed = Buffer.concat(chunks).toString("utf8").trim();
    if (!trimmed) throw new Error("stdin was empty.");
    return trimmed;
  }

  throw new Error(
    "Provide input via --message, --file, or pipe text with --stdin.",
  );
}