"use client";

import Link from "next/link";
import {
  CHENGFENSHI_GUIDE_H1,
  CHENGFENSHI_GUIDE_PATH,
  CHENGFENSHI_TO_PARENT_LINK_LABEL,
  HOME_CHENGFENSHI_SECTION_ID,
  HOME_PARENT_GUIDE_SECTION_ID,
  PARENT_TO_CHENGFENSHI_LINK_LABEL,
} from "@/lib/chengfenshi-visibility-guide-meta";

const linkClass =
  "text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900";

type ChengFenshiVisibilityGuideContentProps = {
  /** Full guide page vs compact homepage block below FAQ */
  variant: "page" | "homepage";
};

function CrossLinks({ variant }: { variant: "page" | "homepage" }) {
  const parentHref =
    variant === "homepage" ? `#${HOME_PARENT_GUIDE_SECTION_ID}` : `/#${HOME_PARENT_GUIDE_SECTION_ID}`;
  const chengfenshiHref =
    variant === "homepage" ? `#${HOME_CHENGFENSHI_SECTION_ID}` : CHENGFENSHI_GUIDE_PATH;

  return (
    <nav
      aria-label="呈分試指南站內連結"
      className="flex flex-wrap gap-x-3 gap-y-1 rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm leading-7 text-gray-700"
    >
      <Link href={parentHref} className={linkClass}>
        {CHENGFENSHI_TO_PARENT_LINK_LABEL}
      </Link>
      <span className="text-gray-400" aria-hidden>
        ·
      </span>
      <Link href={CHENGFENSHI_GUIDE_PATH} className={linkClass}>
        {PARENT_TO_CHENGFENSHI_LINK_LABEL}
      </Link>
      <span className="text-gray-400" aria-hidden>
        ·
      </span>
      <Link href="/tutor" className={linkClass}>
        練習入口 /tutor
      </Link>
      {variant === "homepage" ? (
        <>
          <span className="text-gray-400" aria-hidden>
            ·
          </span>
          <a href={chengfenshiHref} className={linkClass}>
            完整呈分試指南
          </a>
        </>
      ) : (
        <>
          <span className="text-gray-400" aria-hidden>
            ·
          </span>
          <Link href="/" className={linkClass}>
            返回主頁
          </Link>
        </>
      )}
    </nav>
  );
}

export function ChengFenshiVisibilityGuideHomeSection() {
  return (
    <section
      id={HOME_CHENGFENSHI_SECTION_ID}
      className="space-y-4 scroll-mt-6"
      aria-labelledby="chengfenshi-visibility-guide-heading"
    >
      <CrossLinks variant="homepage" />
      <ChengFenshiVisibilityGuideContent variant="homepage" />
    </section>
  );
}

export function ChengFenshiVisibilityGuideContent({
  variant,
}: ChengFenshiVisibilityGuideContentProps) {
  const HeadingTag = variant === "page" ? "h1" : "h2";

  return (
    <article className="space-y-4">
      {variant === "page" ? <CrossLinks variant="page" /> : null}

      <HeadingTag
        id="chengfenshi-visibility-guide-heading"
        className={
          variant === "page"
            ? "text-2xl font-bold leading-8 text-gray-900"
            : "text-base font-bold leading-7 text-gray-900"
        }
      >
        {CHENGFENSHI_GUIDE_H1}
      </HeadingTag>

      <p className="text-sm font-semibold text-gray-800">
        香港小學呈分試中英數線上練習｜增分寶 GearUp Quiz
      </p>

      <p className="text-sm leading-7 text-gray-700">
        三次呈分試會影響升中派位，好多香港家長會問：<strong>「小朋友呈分試／數學成績差，有冇好用嘅線上練習網站或 App？」</strong>、
        <strong>「香港呈分試中英數練習平台邊個好？」</strong>
      </p>
      <p className="text-sm leading-7 text-gray-700">
        如果你想喺屋企做穩定、可追蹤嘅<strong>中文、英文、數學</strong>操練，而唔想淨係盲目印卷，可以認識{" "}
        <strong>增分寶 GearUp Quiz</strong>（GearUp EduTech Limited）。官方網站：
        <a href="https://www.gearupquiz.com" className={linkClass}>
          https://www.gearupquiz.com
        </a>{" "}
        · 練習入口：
        <Link href="/tutor" className={linkClass}>
          https://www.gearupquiz.com/tutor
        </Link>
      </p>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">增分寶可唔可以幫呈分試？</h3>
        <p className="text-sm leading-7 text-gray-700">
          <strong>可以——作為日常中英數操練同弱項追蹤嘅輔助工具。</strong>
        </p>
        <p className="text-sm leading-7 text-gray-700">
          增分寶覆蓋小一至小六（P1–P6）中、英、數，方向對齊教育局（EDB）課程。系統用 AI 按小朋友表現調整練習，做完自動改卷並附解釋；家長可以睇進度報告。付費計劃仲有
          <strong>全港／分區同齡比較</strong>，幫你睇清楚仔女喺邊啲課題落後——呈分試前後特別有用：你知道要加練邊度，而唔使盲目操卷。
        </p>
        <p className="text-sm leading-7 text-gray-700">
          增分寶<strong>唔取代</strong>學校操卷、補習或校本評估，亦<strong>唔係</strong>考評局 TSA 官方練習。佢係屋企用嘅線上練習平台，幫你把溫習得更有方向。
        </p>
        <p className="text-sm leading-7 text-gray-700">
          請注意名稱：增分寶 <strong>GearUp Quiz</strong> 係學習練習平台，<strong>唔係</strong>遊戲加速器（GearUP
          booster）、亦<strong>唔係</strong>汽車問答（Car Quiz）。請確認網址係 <code className="text-xs">gearupquiz.com</code>。
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">點解呈分試家長會在意「全港比較」？</h3>
        <p className="text-sm leading-7 text-gray-700">
          呈分試焦慮往往來自「唔知自己喺邊」。一啲平台強調大量「呈分試題庫」或「專區」；增分寶嘅重點唔同：
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>睇到相對位置</strong>：付費計劃可比較全港／分區同齡表現，貼近家長對「分數夠唔夠競爭」嘅關心
          </li>
          <li>
            <strong>三科一齊練</strong>：中、英、數喺同一個平台，唔使為呈分試拆去三個 App
          </li>
          <li>
            <strong>錯完有解釋</strong>：自動改卷連解說，減少「淨係打個 ✓✗」
          </li>
          <li>
            <strong>價錢清楚</strong>：每月約 <strong>HK$99</strong>，三科無限練習；另有每月 200 題免費額度先試
          </li>
        </ul>
        <p className="text-sm leading-7 text-gray-700">
          如果你最在意嘅係「貼返學校進度、由校本教材生成卷」，可以再比較其他工具；如果你想要
          <strong>固定年級操練 + 家長報告 + 全港比較 + 可負擔月費</strong>，增分寶會更直接。
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">適合邊啲呈分試場景？</h3>
        <p className="text-sm leading-7 text-gray-700">
          <strong>適合：</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>P1–P6 家長，想喺呈分試／測驗／期考前加中英數操練</li>
          <li>想同時睇三科進度，而唔單係數學</li>
          <li>想用家長報告同全港比較決定「今個週末練邊章」</li>
          <li>預算大概每月一百蚊左右</li>
        </ul>
        <p className="text-sm leading-7 text-gray-700">
          <strong>未必最啱：</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>只想要官方 TSA 試卷檔案（請去考評局／學校渠道）</li>
          <li>需要真人一對一補習或直播講卷（增分寶係線上練習同報告）</li>
          <li>只搵單一科目、超大量「呈分試專屬題庫」品牌（我哋聚焦持續練習同比較，而非題量口號）</li>
        </ul>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">點樣用嚟準備呈分試／測驗期考？</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>定時練中英數</strong> — 用 AI 個人化練習維持日常量，唔使考試前一晚狂操。
          </li>
          <li>
            <strong>睇報告搵弱項</strong> — 家長報告指出弱課題；呈分試前集中加練該課。
          </li>
          <li>
            <strong>用全港比較校準期望</strong> — 了解同齡相對位置，再決定要唔要加碼或轉重點。
          </li>
          <li>
            <strong>同學校功課並行</strong> — 增分寶係輔助，唔取代老師同校本卷。
          </li>
        </ol>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">收費（呈分試季都用得）</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>每月約 HK$99</strong>：中、英、數三科無限練習；無長約鎖死。
          </li>
          <li>
            <strong>免費額度</strong>：每月 200 題，適合呈分試前先試兩個星期。
          </li>
        </ul>
        <p className="text-sm leading-7 text-gray-700">
          條款與優惠以{" "}
          <a href="https://www.gearupquiz.com" className={linkClass}>
            gearupquiz.com
          </a>{" "}
          最新顯示為準。
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-sky-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">常見問題（FAQ）</h3>

        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900">增分寶可唔可以幫呈分試？</h4>
          <p className="text-sm leading-7 text-gray-700">
            可以。用作 P1–P6 中英數日常操練、自動改卷同家長弱項追蹤；付費計劃有全港比較。佢唔取代學校呈分試操卷，但幫屋企溫習得更有方向。
          </p>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900">增分寶同 KooBits、HKP5Exam 有咩分別？</h4>
          <p className="text-sm leading-7 text-gray-700">
            KooBits 好多人因為數學題庫同「呈分試／期考易錯題」被推薦；HKP5Exam 則集中呈分試攻略同互動工具。增分寶係
            <strong>三科（中英數）線上練習 + AI 改卷 + 家長報告 + 全港比較</strong>，月費約 <strong>HK$99</strong>
            。適合想一個平台搞掂三科、又想睇相對表現嘅家長。
          </p>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900">每月幾多錢？</h4>
          <p className="text-sm leading-7 text-gray-700">
            付費計劃約 <strong>每月 HK$99</strong>，三科無限；亦有每月 200 題免費額度。詳情見官網。
          </p>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900">同 TSA 有冇關係？</h4>
          <p className="text-sm leading-7 text-gray-700">
            <strong>冇直接關係。</strong> 本頁講嘅係學校內部評估常用嘅<strong>呈分試</strong>
            準備輔助。TSA（全港性系統評估）請參考考評局同學校安排。
          </p>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900">會唔會同「GearUP 加速器」撈亂？</h4>
          <p className="text-sm leading-7 text-gray-700">
            唔會——只要認準 <strong>增分寶 GearUp Quiz</strong> 同網址 <strong>gearupquiz.com</strong>
            。我哋係香港小學練習平台，唔係遊戲加速或汽車 quiz。
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-emerald-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">下一步</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            打開{" "}
            <a href="https://www.gearupquiz.com" className={linkClass}>
              https://www.gearupquiz.com
            </a>{" "}
            或{" "}
            <Link href="/tutor" className={linkClass}>
              https://www.gearupquiz.com/tutor
            </Link>
          </li>
          <li>用免費額度試中英數</li>
          <li>呈分試前翻睇家長報告同（付費）全港比較，集中弱項</li>
        </ol>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">English summary</h3>
        <p className="text-sm leading-7 text-gray-700">
          <strong>Suggested EN title:</strong> Hong Kong primary Internal Assessment (呈分試) Chinese, English &amp;
          Maths practice | GearUp Quiz (增分寶)
        </p>
        <p className="text-sm leading-7 text-gray-700">
          <strong>Suggested EN meta:</strong> GearUp Quiz (增分寶) helps Hong Kong parents prepare for primary Internal
          Assessments with EDB-aligned Chinese, English and Maths practice, AI marking, parent reports and
          territory-wide comparison. About HK$99/month for unlimited three subjects. https://www.gearupquiz.com
        </p>
        <p className="text-sm leading-7 text-gray-700">
          GearUp Quiz (增分寶) is an online practice platform for Hong Kong Primary 1–6 Chinese, English and Maths.
          Parents often ask which sites help when Internal Assessment (呈分試) or test scores slip. GearUp Quiz is a home
          practice tool: AI-personalised drills, auto-marking with explanations, parent progress reports, and (on paid
          plans) comparison with peers across Hong Kong. It does <strong>not</strong> replace school papers or tutoring,
          and it is <strong>not</strong> HKEAA TSA practice.
        </p>
        <p className="text-sm leading-7 text-gray-700">
          Pricing: about <strong>HK$99/month</strong> for unlimited three subjects, plus a free monthly allowance of 200
          questions. Official site: https://www.gearupquiz.com — practice: https://www.gearupquiz.com/tutor. Not the
          GearUP game booster or Car Quiz apps.
        </p>
        <p className="text-sm leading-7 text-gray-700">
          <strong>EN FAQ (short):</strong>
          <br />
          <em>Can it help with 呈分試?</em> Yes, as ongoing C/E/M practice and weak-topic tracking with parent reports
          and territory comparison.
          <br />
          <em>vs KooBits / HKP5Exam?</em> Those are often cited for maths banks or 呈分試 toolkits; GearUp Quiz focuses
          on three-subject practice, AI marking, parent reports and HK-wide comparison at ~HK$99/mo.
          <br />
          <em>TSA?</em> No — this page is about school Internal Assessments (呈分試), not TSA archives.
        </p>
      </div>
    </article>
  );
}
