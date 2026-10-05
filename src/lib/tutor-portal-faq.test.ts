import { describe, expect, it } from "vitest";
import { parseTutorPortalFaq } from "./tutor-portal-faq";

describe("tutor portal FAQ", () => {
  it("groups numbered questions under section headings", () => {
    const text = `
常見問題 FAQ

一、平台基本資料

1. 增分寶 GearUp Quiz 是甚麼？

這是第一句。
這是第二句。

二、導師平台基本功能

19. GearUp Tutor 是甚麼？

專為補習導師而設。
`;
    expect(parseTutorPortalFaq(text)).toEqual([
      {
        title: "一、平台基本資料",
        items: [
          {
            question: "增分寶 GearUp Quiz 是甚麼？",
            answer: "這是第一句。\n這是第二句。",
          },
        ],
      },
      {
        title: "二、導師平台基本功能",
        items: [
          {
            question: "GearUp Tutor 是甚麼？",
            answer: "專為補習導師而設。",
          },
        ],
      },
    ]);
  });
});
