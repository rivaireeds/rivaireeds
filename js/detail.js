/**
 * detail.js
 * URL의 ?ticker=005930 파라미터를 읽어서
 * data/history/{ticker}.json (시세 이력 + 분석 + 공시)을 불러와 상세 페이지를 렌더링한다.
 *
 * data/history/{ticker}.json 에는 이미 analysis(신호/파동/타점/별점)가 통째로 들어있어서
 * "신호가 없어도 워치리스트(코스피/코스닥 시총 상위 300)에 속한 종목"도 이 페이지 하나로 완결된다.
 */

(function () {
  const params = new URLSearchParams(window.location.search);
  const ticker = params.get("ticker");
  const content = document.getElementById("detailContent");

  if (!ticker) {
    content.innerHTML = `<p class="empty-state">종목이 지정되지 않았습니다. 목록으로 돌아가주세요.</p>`;
    return;
  }

  function changeClass(rate) {
    if (rate === null || rate === undefined) return "change-flat";
    if (rate > 0) return "change-up";
    if (rate < 0) return "change-down";
    return "change-flat";
  }

  function scoreMeterHtml(score) {
    const max = 5;
    let segs = "";
    for (let i = 0; i < max; i++) {
      segs += `<div class="seg ${i < score ? "on" : ""}"></div>`;
    }
    return `<div class="score-meter">${segs}</div>`;
  }

  function starHtml(stars) {
    const max = 5;
    let out = "";
    for (let i = 0; i < max; i++) {
      out += `<span class="star ${i < stars ? "filled" : ""}">★</span>`;
    }
    return out;
  }

  function ratingClass(label) {
    if (label === "매수 적합") return "rating-buy";
    if (label === "관심 필요") return "rating-watch";
    return "rating-hold";
  }

  // TradingView는 한국거래소(코스피/코스닥)를 통합해서 "KRX:" 접두사 하나로 심볼을 제공한다
  function tradingViewSymbol(ticker) {
    return `KRX:${ticker}`;
  }

  async function load() {
    let history, waveBasisNote = "";

    try {
      const res = await fetch(`data/history/${ticker}.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("history not found");
      history = await res.json();
    } catch (err) {
      content.innerHTML = `<p class="empty-state">
        이 종목의 상세 데이터를 찾을 수 없습니다. (신호 목록·워치리스트 300종목에 없는 종목이거나,
        데이터가 아직 갱신되지 않았을 수 있어요)
      </p>`;
      return;
    }

    try {
      const res = await fetch(`data/signals.json?t=${Date.now()}`);
      const data = await res.json();
      waveBasisNote = data.wave_basis_note || "";
    } catch (err) {
      // 기준 설명 문구를 못 가져와도 나머지 렌더링에는 지장 없음
    }

    render(history, waveBasisNote);
  }

  function render(history, waveBasisNote) {
    const info = history.analysis || {};
    const rate = info.change_rate;
    const rateText =
      rate === null || rate === undefined ? "-" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;

    const tags = (info.signals || []).map((s) => `<span class="tag">${s}</span>`).join("");
    const hasSignals = (info.signals || []).length > 0;

    const disclosures = history.disclosures || [];
    const disclosuresHtml =
      disclosures.length > 0
        ? disclosures
            .map(
              (d) => `
        <a class="disclosure-item" href="${d.url}" target="_blank" rel="noopener">
          <span class="disclosure-title">${d.title}</span>
          <span class="disclosure-date">${d.date}</span>
        </a>
      `
            )
            .join("")
        : `<p class="empty-state" style="padding:20px;">최근 90일 내 공시가 없거나, 공시 조회 기능이 아직 설정되지 않았어요.</p>`;

    content.innerHTML = `
      <div class="detail-header">
        <div class="detail-title">
          <h1>${history.name}</h1>
          <span class="stock-ticker">${history.ticker}</span>
          <span class="stock-market">${history.market}</span>
          <div class="detail-rating">
            <div class="rating-badge ${ratingClass(info.rating_label)}">
              <div class="stars">${starHtml(info.rating_stars ?? 0)}</div>
              <span class="rating-text">${info.rating_label ?? "-"}</span>
            </div>
          </div>
        </div>
        <div class="detail-price">
          ${history.close.at(-1).toLocaleString()}<span class="unit">원</span>
          <div class="${changeClass(rate)}" style="font-size:14px;">${rateText}</div>
        </div>
      </div>

      <section class="detail-stats">
        <div class="stat-card">
          <div class="stat-num">${scoreMeterHtml(info.score ?? 0)}</div>
          <div class="stat-label">신호 점수</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${info.rsi ?? "-"}</div>
          <div class="stat-label">RSI(14)</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${info.volume_ratio ? info.volume_ratio + "x" : "-"}</div>
          <div class="stat-label">거래량 / 20일평균</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${info.volume?.toLocaleString() ?? "-"}</div>
          <div class="stat-label">당일 거래량</div>
        </div>
      </section>

      ${
        hasSignals
          ? `<div class="tag-list" style="margin-bottom:20px;">${tags}</div>`
          : `<p class="lookup-hint" style="margin-bottom:20px;">현재 감지된 기술적 신호가 없어요 (워치리스트 종목이라 항상 조회는 가능해요).</p>`
      }

      ${
        info.wave_direction
          ? `
      <div class="chart-card">
        <h3>파동 위치 &amp; 매매 타점</h3>
        <div class="wave-row">
          <span class="wave-badge ${info.wave_direction === "상승" ? "wave-up" : "wave-down"}">
            ${info.wave_direction} ${info.wave_number}파 진행 중
          </span>
          <span class="wave-progress">전 스윙 대비 진행률 ${info.wave_progress_pct ?? "-"}%</span>
        </div>
        <div class="level-grid">
          <div class="level-box">
            <div class="level-label">매수타점 (조정시 38.2%)</div>
            <div class="level-value">${info.buy_point ? info.buy_point.toLocaleString() + "원" : "해당없음"}</div>
          </div>
          <div class="level-box target">
            <div class="level-label">목표가 (확장 1.272배)</div>
            <div class="level-value">${info.target_price ? info.target_price.toLocaleString() + "원" : "해당없음"}</div>
          </div>
          <div class="level-box stop">
            <div class="level-label">손절가</div>
            <div class="level-value">${info.stop_loss ? info.stop_loss.toLocaleString() + "원" : "-"}</div>
          </div>
        </div>
        <p class="wave-basis">${waveBasisNote || ""}</p>
      </div>
      `
          : ""
      }

      <div class="chart-card">
        <h3>일봉 차트 (TradingView)</h3>
        <div id="tvChartContainer" style="height:460px;"></div>
        <p class="wave-basis">TradingView 위젯이며, 무료 버전 기준 최대 15분 지연 시세일 수 있어요. 캔들/보조지표/타임프레임을 직접 조절할 수 있어요.</p>
      </div>

      <div class="chart-card">
        <h3>일봉 캔들 &amp; 매매 타점 오버레이</h3>
        <div class="chart-wrap"><canvas id="priceChart"></canvas></div>
        <div class="legend-row">
          <span class="legend-item"><span class="legend-dot" style="background:#e5484d"></span>상승봉</span>
          <span class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>하락봉</span>
          <span class="legend-item"><span class="legend-dot" style="background:#f0b64d"></span>MA5</span>
          <span class="legend-item"><span class="legend-dot" style="background:#3ddc97"></span>MA20</span>
          <span class="legend-item"><span class="legend-dot" style="background:#a9b4cc"></span>MA60</span>
          ${info.buy_point ? `<span class="legend-item"><span class="legend-dot" style="background:#f0b64d;opacity:.6"></span>매수타점(점선)</span>` : ""}
          ${info.target_price ? `<span class="legend-item"><span class="legend-dot" style="background:#3ddc97"></span>목표가(점선)</span>` : ""}
          ${info.stop_loss ? `<span class="legend-item"><span class="legend-dot" style="background:#e5484d"></span>손절가(점선)</span>` : ""}
        </div>
      </div>

      <div class="chart-card">
        <h3>거래량</h3>
        <div class="chart-wrap volume"><canvas id="volumeChart"></canvas></div>
      </div>

      <div class="chart-card">
        <h3>최근 공시 (DART, 최근 90일)</h3>
        <div class="disclosure-list">${disclosuresHtml}</div>
      </div>

      <p class="footnote">
        본 페이지는 기술적 지표 기반 자동 스캔 결과이며, 투자 조언이나 매수·매도 추천이 아닙니다.
      </p>
    `;

    drawCharts(history, info);
    drawTradingView(ticker); // history.ticker가 아니라 URL의 ticker(원본값)를 그대로 사용
  }

  function drawTradingView(tickerCode) {
    const tvContainer = document.getElementById("tvChartContainer");
    if (typeof TradingView === "undefined") {
      tvContainer.innerHTML =
        `<p class="empty-state">TradingView 위젯을 불러오지 못했어요. 잠시 후 새로고침 해주세요.</p>`;
      return;
    }
    const symbol = tradingViewSymbol(tickerCode);
    console.log("[detail.js] TradingView 심볼:", symbol); // 문제 재발 시 브라우저 콘솔(F12)에서 확인용
    new TradingView.widget({
      autosize: true,
      symbol: symbol,
      interval: "D",
      timezone: "Asia/Seoul",
      theme: "dark",
      style: "1", // 캔들스틱
      locale: "kr",
      toolbar_bg: "#0a0f1a",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: "tvChartContainer",
    });
  }

  function flatLine(labels, value) {
    return labels.map(() => value);
  }

  function toXY(dates, values) {
    return dates.map((d, i) => ({ x: new Date(d).valueOf(), y: values[i] }));
  }

  function drawCharts(history, info) {
    const labels = history.dates.map((d) => d.slice(5)); // MM-DD만 표시 (라인차트 폴백용)

    const canCandlestick =
      typeof Chart !== "undefined" &&
      Chart.registry &&
      Chart.registry.controllers.get("candlestick");

    if (canCandlestick) {
      try {
        drawCandlestickOverlay(history, info);
      } catch (err) {
        console.warn("[detail.js] 캔들스틱 차트 렌더링 실패, 라인차트로 대체합니다:", err);
        drawLineOverlay(history, info, labels);
      }
    } else {
      console.warn("[detail.js] 캔들스틱 플러그인을 불러오지 못해 라인차트로 대체합니다.");
      drawLineOverlay(history, info, labels);
    }

    drawVolumeChart(history, labels);
  }

  function drawCandlestickOverlay(history, info) {
    const candleData = history.dates.map((d, i) => ({
      x: new Date(d).valueOf(),
      o: history.open[i],
      h: history.high[i],
      l: history.low[i],
      c: history.close[i],
    }));

    const datasets = [
      {
        label: "일봉",
        type: "candlestick",
        data: candleData,
        color: { up: "#e5484d", down: "#3b82f6", unchanged: "#7c869c" }, // 국내 관례: 상승=빨강, 하락=파랑
        borderColor: { up: "#e5484d", down: "#3b82f6", unchanged: "#7c869c" },
      },
      {
        label: "MA5",
        type: "line",
        data: toXY(history.dates, history.ma5),
        borderColor: "#f0b64d",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
      },
      {
        label: "MA20",
        type: "line",
        data: toXY(history.dates, history.ma20),
        borderColor: "#3ddc97",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
      },
      {
        label: "MA60",
        type: "line",
        data: toXY(history.dates, history.ma60),
        borderColor: "#a9b4cc",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
      },
    ];

    if (info?.buy_point) {
      datasets.push({
        label: "매수타점",
        type: "line",
        data: toXY(history.dates, flatLine(history.dates, info.buy_point)),
        borderColor: "#f0b64d",
        borderWidth: 1,
        borderDash: [5, 4],
        pointRadius: 0,
      });
    }
    if (info?.target_price) {
      datasets.push({
        label: "목표가",
        type: "line",
        data: toXY(history.dates, flatLine(history.dates, info.target_price)),
        borderColor: "#3ddc97",
        borderWidth: 1,
        borderDash: [5, 4],
        pointRadius: 0,
      });
    }
    if (info?.stop_loss) {
      datasets.push({
        label: "손절가",
        type: "line",
        data: toXY(history.dates, flatLine(history.dates, info.stop_loss)),
        borderColor: "#e5484d",
        borderWidth: 1,
        borderDash: [2, 3],
        pointRadius: 0,
      });
    }

    new Chart(document.getElementById("priceChart"), {
      type: "candlestick",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            type: "time",
            time: { unit: "week" },
            ticks: { color: "#7c869c", maxTicksLimit: 10 },
            grid: { color: "#182137" },
          },
          y: { ticks: { color: "#7c869c" }, grid: { color: "#182137" } },
        },
      },
    });
  }

  function drawLineOverlay(history, info, labels) {
    const priceDatasets = [
      {
        label: "종가",
        data: history.close,
        borderColor: "#f0b64d",
        backgroundColor: "#f0b64d22",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
        fill: true,
      },
      {
        label: "MA5",
        data: history.ma5,
        borderColor: "#e5484d",
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.15,
      },
      {
        label: "MA20",
        data: history.ma20,
        borderColor: "#3b82f6",
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.15,
      },
      {
        label: "MA60",
        data: history.ma60,
        borderColor: "#8b93a7",
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.15,
      },
    ];

    if (info?.buy_point) {
      priceDatasets.push({
        label: "매수타점",
        data: flatLine(labels, info.buy_point),
        borderColor: "#f0b64d",
        borderWidth: 1,
        borderDash: [5, 4],
        pointRadius: 0,
      });
    }
    if (info?.target_price) {
      priceDatasets.push({
        label: "목표가",
        data: flatLine(labels, info.target_price),
        borderColor: "#3ddc97",
        borderWidth: 1,
        borderDash: [5, 4],
        pointRadius: 0,
      });
    }
    if (info?.stop_loss) {
      priceDatasets.push({
        label: "손절가",
        data: flatLine(labels, info.stop_loss),
        borderColor: "#e5484d",
        borderWidth: 1,
        borderDash: [2, 3],
        pointRadius: 0,
      });
    }

    new Chart(document.getElementById("priceChart"), {
      type: "line",
      data: { labels, datasets: priceDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#7c869c", maxTicksLimit: 10 }, grid: { color: "#182137" } },
          y: { ticks: { color: "#7c869c" }, grid: { color: "#182137" } },
        },
      },
    });
  }

  function drawVolumeChart(history, labels) {
    new Chart(document.getElementById("volumeChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "거래량",
            data: history.volume,
            backgroundColor: "#3b4a7566",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { display: false }, grid: { display: false } },
          y: { ticks: { color: "#7c869c" }, grid: { color: "#182137" } },
        },
      },
    });
  }

  load();
})();
