import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Standalone voice countdown page for https://www.gearupquiz.com/countdown.
 * The HTML stays in public/countdown.html so it can be edited without the app shell.
 */
export async function GET() {
  const htmlPath = path.join(process.cwd(), "public", "countdown.html");
  const html = await readFile(htmlPath, "utf8");
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
