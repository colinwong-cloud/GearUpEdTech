import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

/**
 * Standalone voice countdown page for https://www.gearupquiz.com/countdown.
 * The HTML stays in public/countdown.html so it can be edited without the app shell.
 */
export async function GET() {
  const html = await readFile(new URL("../../../public/countdown.html", import.meta.url), "utf8");
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
