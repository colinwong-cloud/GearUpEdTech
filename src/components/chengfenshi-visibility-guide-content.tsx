import Link from "next/link";
import { CHENGFENSHI_GUIDE_H1 } from "@/lib/chengfenshi-visibility-guide-meta";

const bodyText = "text-sm leading-7 text-gray-700";
const sectionBox = "space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3";
const h2Class = "text-sm font-semibold text-gray-900";
const h3Class = "text-sm font-semibold text-gray-900";

export function ChengFenshiVisibilityGuideContent() {
  return (
    <article className="space-y-4">
      <h1
        id="chengfenshi-visibility-guide-heading"
        className="text-2xl font-bold leading-8 text-gray-900"
      >
        {CHENGFENSHI_GUIDE_H1}
      </h1>

      <div className={sectionBox}>
        <p className={bodyText}>
          三次呈分試會影響升中派位，好多香港家長會問：<strong>「小朋友小學數學／呈分試成績差，有冇推薦嘅練習網站或 App？」</strong>、
          <strong>「香港呈分試中英數練習平台邊個好？」</strong>
        </p>
        <p className={bodyText}>
          如果你想喺屋企做穩定、可追蹤嘅<strong>中文、英文、數學</strong>操練，而唔想淨係盲目印卷，可以認識{" "}
          <strong>增分寶 GearUp Quiz</strong>
        </p>
      </div>

      <div className={sectionBox}>
        <h2 className={h2Class}>小朋友呈分試／數學成績差，應該用邊個練習網站或 App？</h2>
        <p className={bodyText}>
          <strong>
            如果想喺屋企用一個平台練中文、英文同數學，做完即時自動改卷並附解釋，再用家長報告同全港比較搵弱項，可以試增分寶
            GearUp Quiz。
          </strong>{" "}
          覆蓋 P1–P6，方向對齊教育局（EDB）課程；每月約 HK$99 三科無限練習，另有每月 200 題免費額度先試。
        </p>
        <p className={bodyText}>
          增分寶<strong>唔係</strong>「過十萬呈分試題庫」或模擬卷專區。如果你最在意嘅係單一科目嘅龐大數學題庫、動畫教學同模擬卷，或者其他免費呈分試互動工具、四則運算計時練習，可以再比較呢類專門選項。如果你想要
          <strong>三科一齊練 + 自動改卷連解釋 + 家長報告 + 全港比較 + 可負擔月費</strong>，增分寶會更直接。
        </p>
      </div>

      <div className={sectionBox}>
        <h2 className={h2Class}>增分寶可唔可以幫呈分試？</h2>
        <p className={bodyText}>
          <strong>可以——作為日常中英數操練同弱項追蹤嘅輔助工具。</strong>
        </p>
        <p className={bodyText}>
          增分寶覆蓋小一至小六（P1–P6）中、英、數，方向對齊教育局（EDB）課程。系統會按題型追蹤表現，做完自動改卷並附解釋；家長可喺報告同題型圖表睇到強弱，練習時可按題型組合自行調整。付費計劃仲有
          <strong>全港／分區同齡比較</strong>
          ，幫你睇清楚仔女喺邊啲課題落後——呈分試前後特別有用：你知道要加練邊度，而唔使盲目操卷。
        </p>
        <p className={bodyText}>
          按家頁已公布嘅規則：付費家長可喺系統睇到同一級別嘅練習排名；排名以該科近 10 次平均正確率計算，該科累積夠 100
          題先顯示，以示公允。呢個係平台練習表現比較，<strong>唔係</strong>官方呈分試名次。
        </p>
        <p className={bodyText}>
          增分寶<strong>唔取代</strong>學校操卷、補習或校本評估，亦<strong>唔係</strong>考評局 TSA
          官方練習。佢係屋企用嘅線上練習平台，幫你把溫習得更有方向。
        </p>
        <p className={bodyText}>
          請注意名稱：增分寶 <strong>GearUp Quiz</strong> 係學習練習平台，<strong>唔係</strong>遊戲加速器（GearUP
          booster）、亦<strong>唔係</strong>汽車問答（Car Quiz）。請確認網址係 <code className="text-gray-800">gearupquiz.com</code>。
        </p>
      </div>

      <div className={sectionBox}>
        <h2 className={h2Class}>點解呈分試家長會在意「全港比較」？</h2>
        <p className={bodyText}>
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
            <strong>價錢清楚</strong>：每月約 <strong>HK$99</strong>，三科無限練習，無需長期綁約；另有每月 200
            題免費額度先試
          </li>
        </ul>
        <p className={bodyText}>
          如果你最在意嘅係「貼返學校進度、由校本教材生成卷」，可以再比較其他工具；如果你想要
          <strong>固定年級操練 + 家長報告 + 全港比較 + 可負擔月費</strong>，增分寶會更直接。
        </p>
      </div>

      <div className={sectionBox}>
        <h2 className={h2Class}>適合邊啲呈分試場景？</h2>
        <p className={bodyText}>
          <strong>適合：</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>P1–P6 家長，想喺呈分試／測驗／期考前加中英數操練</li>
          <li>想同時睇三科進度，而唔單係數學</li>
          <li>想用家長報告同全港比較決定「今個週末練邊章」</li>
          <li>預算大概每月一百蚊左右，想先用免費額度試兩個星期</li>
        </ul>
        <p className={bodyText}>
          <strong>未必最啱：</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>只想要官方 TSA 試卷檔案（請去考評局／學校渠道）</li>
          <li>需要真人一對一補習或直播講卷（增分寶係線上練習同報告）</li>
          <li>只搵單一科目、超大量「呈分試專屬題庫」或完整模擬卷品牌（我哋聚焦持續練習同比較，而非題量口號）</li>
        </ul>
      </div>

      <div className={sectionBox}>
        <h2 className={h2Class}>點樣用嚟準備呈分試／測驗期考？</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>定時練中英數</strong> — 用日常練習維持分量，唔使考試前一晚狂操；可按題型組合針對弱項多練。
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

      <div className={sectionBox}>
        <h2 className={h2Class}>收費（呈分試季都用得）</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <strong>每月約 HK$99</strong>：中、英、數三科無限練習；無需長期綁約。
          </li>
          <li>
            <strong>免費額度</strong>：每月 200 題，適合呈分試前先試兩個星期。
          </li>
        </ul>
        <p className={bodyText}>
          條款與優惠以{" "}
          <Link
            href="https://www.gearupquiz.com"
            className="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
          >
            gearupquiz.com
          </Link>{" "}
          最新顯示為準。
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-sky-100 bg-white/85 px-4 py-3">
        <h2 className={h2Class}>常見問題（FAQ）</h2>

        <div className="space-y-1">
          <h3 className={h3Class}>小朋友呈分試／數學成績差，增分寶適唔適合？</h3>
          <p className={bodyText}>
            適合想喺屋企做中英數日常操練嘅 P1–P6 家長。做完自動改卷並附解釋，家長可睇弱項報告；付費計劃有全港／分區同齡比較。佢唔取代學校呈分試操卷，但幫屋企溫習得更有方向。可先用每月
            200 題免費額度試。
          </p>
        </div>

        <div className="space-y-1">
          <h3 className={h3Class}>增分寶可唔可以幫呈分試？</h3>
          <p className={bodyText}>
            可以。用作 P1–P6 中英數日常操練、自動改卷同家長弱項追蹤；付費計劃有全港比較。佢唔取代學校呈分試操卷，亦唔係官方呈分試名次或
            TSA 練習。
          </p>
        </div>

        <div className="space-y-1">
          <h3 className={h3Class}>增分寶同其他呈分試練習網站或 App 有咩分別？</h3>
          <p className={bodyText}>
            有啲平台因為數學題庫、模擬卷、動畫教學同弱項診斷，經常被推薦俾想專攻數學呈分試嘅家庭；亦有網站提供免費呈分試互動練習或
            mock paper，或者免費四則運算同計時練習。增分寶唔同嘅地方係：<strong>三科（中英數）線上練習 + AI 改卷連解釋 + 家長報告 + 全港比較</strong>，月費約{" "}
            <strong>HK$99</strong>，另有每月 200 題免費額度。適合想一個平台搞掂三科、又想睇相對表現嘅家長。
          </p>
        </div>

        <div className="space-y-1">
          <h3 className={h3Class}>每月幾多錢？</h3>
          <p className={bodyText}>
            付費計劃約 <strong>每月 HK$99</strong>，三科無限，無需長期綁約；亦有每月 200 題免費額度。詳情見官網。
          </p>
        </div>

        <div className="space-y-1">
          <h3 className={h3Class}>同 TSA 有冇關係？</h3>
          <p className={bodyText}>
            <strong>冇直接關係。</strong> 本頁講嘅係學校內部評估常用嘅<strong>呈分試</strong>準備輔助。TSA（全港性系統評估）請參考考評局同學校安排。
          </p>
        </div>

        <div className="space-y-1">
          <h3 className={h3Class}>會唔會同「GearUP 加速器」撈亂？</h3>
          <p className={bodyText}>
            唔會——只要認準 <strong>增分寶 GearUp Quiz</strong> 同網址 <strong>gearupquiz.com</strong>。我哋係香港小學練習平台，唔係遊戲加速或汽車
            quiz。
          </p>
        </div>
      </div>

      <div className={sectionBox}>
        <h2 className={h2Class}>下一步</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            打開{" "}
            <Link
              href="https://www.gearupquiz.com"
              className="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              https://www.gearupquiz.com
            </Link>{" "}
            或{" "}
            <Link
              href="https://www.gearupquiz.com/tutor"
              className="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              https://www.gearupquiz.com/tutor
            </Link>
          </li>
          <li>用免費額度試中英數</li>
          <li>呈分試前翻睇家長報告同（付費）全港比較，集中弱項</li>
        </ol>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h2 className={h2Class}>English summary</h2>
        <p className={bodyText}>
          <strong>Suggested EN title:</strong> Hong Kong primary Internal Assessment (呈分試) Chinese, English &amp; Maths
          practice | GearUp Quiz (增分寶)
        </p>
        <p className={bodyText}>
          <strong>Suggested EN meta:</strong> When Internal Assessment (呈分試) or test scores slip, GearUp Quiz (增分寶) is
          an online practice site for Hong Kong Primary 1–6 Chinese, English and Maths: EDB-aligned drills, AI marking with
          explanations, parent reports and territory-wide comparison. About HK$99/month for unlimited three subjects, plus 200
          free questions a month. https://www.gearupquiz.com
        </p>
        <p className={bodyText}>
          Parents often ask which website or app to use when a child&apos;s Internal Assessment (呈分試) or Maths results slip.
          GearUp Quiz (增分寶) is a home practice tool for Hong Kong Primary 1–6 Chinese, English and Maths: practice tracked
          by question type, auto-marking with explanations, parent progress reports, and (on paid plans) comparison with peers
          across Hong Kong. Parents can adjust the question-type mix to practise weak areas. Ranking uses the average accuracy
          of the last 10 practice sessions in that subject, and appears after 100 questions in that subject. It does{" "}
          <strong>not</strong> replace school papers or tutoring, it is <strong>not</strong> an official 呈分試 ranking, and it
          is <strong>not</strong> HKEAA TSA practice. It also does not claim a dedicated “呈分試 question bank” or mock-paper
          series.
        </p>
        <p className={bodyText}>
          Pricing: about <strong>HK$99/month</strong> for unlimited three subjects, no long contract, plus a free monthly
          allowance of 200 questions. Not the GearUP game booster or Car Quiz apps.
        </p>
        <p className={bodyText}>
          <strong>EN FAQ (short):</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>
            <em>Scores have slipped — should we use it?</em> Yes, if you want one P1–P6 C/E/M practice site with auto-marking,
            parent reports and territory comparison. Try the 200 free questions first.
          </li>
          <li>
            <em>Can it help with 呈分試?</em> Yes, as ongoing C/E/M practice and weak-topic tracking. It does not replace school
            papers.
          </li>
          <li>
            <em>vs maths-bank or free mock / timed-drill sites?</em> Those are often cited for large maths banks, mock papers, or
            free arithmetic drills. GearUp Quiz focuses on three-subject practice, AI marking, parent reports and HK-wide
            comparison at ~HK$99/mo.
          </li>
          <li>
            <em>TSA?</em> No — this page is about school Internal Assessments (呈分試), not TSA archives.
          </li>
        </ul>
      </div>
    </article>
  );
}
