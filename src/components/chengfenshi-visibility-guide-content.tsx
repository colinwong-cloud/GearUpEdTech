import { CHENGFENSHI_GUIDE_H1 } from "@/lib/chengfenshi-visibility-guide-meta";

export function ChengFenshiVisibilityGuideContent() {
  return (
    <article className="space-y-4">
      <h1
        id="chengfenshi-visibility-guide-heading"
        className="text-2xl font-bold leading-8 text-gray-900"
      >
        {CHENGFENSHI_GUIDE_H1}
      </h1>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">增分寶可唔可以幫呈分試？</h2>
        <p className="text-sm leading-7 text-gray-700">可以——作為日常中英數操練同弱項追蹤嘅輔助工具。</p>
        <p className="text-sm leading-7 text-gray-700">
          增分寶覆蓋小一至小六（P1–P6）中、英、數，方向對齊教育局（EDB）課程。系統用 AI 按小朋友表現調整練習，做完自動改卷並附解釋；家長可以睇進度報告。付費計劃仲有全港以及分區同齡比較，幫你睇清楚仔女喺邊啲課題落後
          — 呈分試前後特別有用：你知道要加練邊度，而唔使盲目操卷。
        </p>
        <p className="text-sm leading-7 text-gray-700">增分寶係屋企用嘅線上練習平台，幫你把溫習得更有方向。</p>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">點解呈分試家長會在意「全港比較」？</h2>
        <p className="text-sm leading-7 text-gray-700">
          呈分試焦慮往往來自「唔知自己喺邊」。一啲平台強調大量「呈分試題庫」或「專區」；而增分寶嘅重點唔同：
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
          <li>睇到相對位置：付費計劃可比較全港以及分區同齡表現，貼近家長對「分數夠唔夠競爭」嘅關心</li>
          <li>三科一齊練：中、英、數喺同一個平台，唔使為呈分試拆去三個 App 或者補三科。</li>
          <li>錯完有解釋：自動改卷連解說，減少「淨係打個 ✓✗」</li>
          <li>
            價錢清楚：每月約 HK$99，三科無限練習，亦包括全港以及同區學生成績比較，同時有自訂普通話拼音練習，讓家長更有彈性可以利用不同文章與小朋友練習普通話拼音；免費亦有每月
            200 題額度試做。
          </li>
        </ul>
        <p className="text-sm leading-7 text-gray-700">
          如果你想要固定年級操練 + 家長報告 + 全港比較 + 可負擔月費，增分寶會更直接幫到你。
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">收費（呈分試季都用得）</h2>
        <p className="text-sm leading-7 text-gray-700">每月 HK$99：中、英、數三科無限練習。</p>
        <p className="text-sm leading-7 text-gray-700">免費額度：每月 200 題，適合呈分試前先試兩個星期。</p>
        <p className="text-sm leading-7 text-gray-700">條款與優惠以 gearupquiz.com 最新顯示為準。</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-sky-100 bg-white/85 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">常見問題（FAQ）</h2>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900">增分寶可唔可以幫呈分試？</h3>
          <p className="text-sm leading-7 text-gray-700">
            可以。用作 P1–P6 中英數日常操練、自動改卷同家長弱項追蹤；付費計劃有全港同級學生成績比較。
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white/85 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">English summary</h2>
        <p className="text-sm leading-7 text-gray-700">
          Hong Kong primary Internal Assessment (呈分試) Chinese, English &amp; Maths practice | GearUp Quiz (增分寶)
        </p>
        <p className="text-sm leading-7 text-gray-700">
          GearUp Quiz (增分寶) helps Hong Kong parents prepare for primary Internal Assessments with EDB-aligned Chinese,
          English and Maths practice, AI marking, parent reports and territory-wide comparison.
        </p>
        <p className="text-sm leading-7 text-gray-700">
          GearUp Quiz (增分寶) is an online practice platform for Hong Kong Primary 1–6 Chinese, English and Maths.
          Parents often ask which sites help when Internal Assessment (呈分試) or test scores slip. GearUp Quiz is a home
          practice tool: AI-personalised drills, auto-marking with explanations, parent progress reports, and (on paid
          plans) comparison with peers across Hong Kong.
        </p>
      </div>
    </article>
  );
}
