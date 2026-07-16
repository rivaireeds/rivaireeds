/**
 * detail.js
 * URL의 ?ticker=005930 파라미터를 읽어서
 * data/history/{ticker}.json (시세 이력) + data/signals.json (신호 정보)을
 * 불러와 상세 페이지를 렌더링한다.
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

  async function load() {
    let history, signalInfo = null;

    try {
      const res = await fetch(`data/history/${ticker}.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("history not found");
      history = await res.json();
    } catch (err) {
      content.innerHTML = `<p class="empty-state">
        이 종목의 상세 데이터를 찾을 수 없습니다. (신호 목록에 없는 종목이거나 데이터가 아직 갱신되지 않았을 수 있어요)
      </p>`;
      return;
    }

    try {
      const res = await fetch(`data/signals.json?t=${Date.now()}`);
      const data = await res.json();
      signalInfo = (data.stocks || []).find((s) => s.ticker === ticker) || null;
    } catch (err) {
      // signals.json을 못 불러와도 차트는 그릴 수 있으니 무시
    }

    render(history, signalInfo);
  }

  function render(history, signalInfo) {
    const rate = signalInfo?.change_rate;
    const rateText =
      rate === null || rate === undefined ? "-" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;

    const tags = (signalInfo?.signals || [])
      .map((s) => `<span class="tag">${s}</span>`)
      .join("");

    content.innerHTML = `
      <div class="detail-header">
        <div class="detail-title">
          <h1>${history.name}</h1>
          <span class="stock-ticker">${history.ticker}</span>
          ${signalInfo ? `<span class="stock-market">${signalInfo.market}</span>` : ""}
        </div>
        <div class="detail-price">
          ${history.close.at(-1).toLocaleString()}<span class="unit">원</span>
          <div class="${changeClass(rate)}" style="font-size:14px;">${rateText}</div>
        </div>
      </div>

      ${
        signalInfo
          ? `
      <section class="detail-stats">
        <div class="stat-card">
          <div class="stat-num">${scoreMeterHtml(signalInfo.score)}</div>
          <div class="stat-label">신호 점수</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${signalInfo.rsi ?? "-"}</div>
          <div class="stat-label">RSI(14)</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${signalInfo.volume_ratio ? signalInfo.volume_ratio + "x" : "-"}</div>
          <div class="stat-label">거래량 / 20일평균</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${signalInfo.volume?.toLocaleString() ?? "-"}</div>
          <div class="stat-label">당일 거래량</div>
        </div>
      </section>
      <div class="tag-list" style="margin-bottom:20px;">${tags}</div>
      `
          : ""
      }

      <div class="chart-card">
        <h3>종가 &amp; 이동평균 (5 / 20 / 60일)</h3>
        <div class="chart-wrap"><canvas id="priceChart"></canvas></div>
        <div class="legend-row">
          <span class="legend-item"><span class="legend-dot" style="background:#f0b64d"></span>종가</span>
          <span class="legend-item"><span class="legend-dot" style="background:#e5484d"></span>MA5</span>
          <span class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>MA20</span>
          <span class="legend-item"><span class="legend-dot" style="background:#8b93a7"></span>MA60</span>
        </div>
      </div>

      <div class="chart-card">
        <h3>거래량</h3>
        <div class="chart-wrap volume"><canvas id="volumeChart"></canvas></div>
      </div>

      <p class="footnote">
        본 페이지는 기술적 지표 기반 자동 스캔 결과이며, 투자 조언이나 매수·매도 추천이 아닙니다.
      </p>
    `;

    drawCharts(history);
  }

  function drawCharts(history) {
    const labels = history.dates.map((d) => d.slice(5)); // MM-DD만 표시

    new Chart(document.getElementById("priceChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
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
        ],
      },
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
