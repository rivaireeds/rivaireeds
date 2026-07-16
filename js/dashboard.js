/**
 * dashboard.js
 * data/signals.json 데이터를 가져와 필터링, 검색, 정렬 후 테이블에 화면 렌더링합니다.
 */

(function () {
  let allStocks = [];
  let currentFilter = "ALL";
  let currentSort = "score_desc";
  let currentSearch = "";

  const tableBody = document.getElementById("tableBody");
  const searchBox = document.getElementById("searchBox");
  const sortSelect = document.getElementById("sortSelect");
  const filterChips = document.getElementById("filterChips");

  async function loadData() {
    try {
      // 캐시 방지 타임스탬프 추가 호출
      const res = await fetch(`data/signals.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("네트워크 응답 오류: signals.json을 찾을 수 없습니다.");
      
      const data = await res.json();

      // 안전한 예외 처리: 데이터가 비어있거나 형식이 이상할 때 가드 코드
      if (!data) {
        throw new Error("JSON 데이터가 비어있습니다.");
      }

      document.getElementById("updateTime").textContent = data.update_time || "-";
      document.getElementById("statScanned").textContent =
        (data.total_scanned || 0).toLocaleString();
      document.getElementById("statSignals").textContent =
        (data.total_signals || 0).toLocaleString();

      // stocks가 존재하지 않거나 빈 배열일 때 안전하게 빈 배열 할당
      allStocks = data.stocks && Array.isArray(data.stocks) ? data.stocks : [];
      render();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">
        데이터를 불러오는 중 문제가 발생했습니다.<br>
        <span style="font-size: 11px; color: var(--text-dim);">${err.message}</span>
      </td></tr>`;
      console.error(err);
    }
  }

  function matchesFilter(stock) {
    if (currentFilter === "ALL") return true;
    const signals = stock.signals || [];
    return signals.includes(currentFilter);
  }

  function matchesSearch(stock) {
    if (!currentSearch) return true;
    const query = currentSearch.toLowerCase();
    const name = (stock.name || "").toLowerCase();
    const ticker = stock.ticker || "";
    return name.includes(query) || ticker.includes(query);
  }

  function sortStocks(stocks) {
    const sorted = [...stocks];
    if (currentSort === "score_desc") {
      sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (currentSort === "change_desc") {
      sorted.sort((a, b) => (b.rate || 0) - (a.rate || 0));
    } else if (currentSort === "volume_desc") {
      sorted.sort((a, b) => (b.volume_ratio || 0) - (a.volume_ratio || 0));
    } else if (currentSort === "name_asc") {
      sorted.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    }
    return sorted;
  }

  function renderRow(stock) {
    const rate = stock.rate || 0;
    const isUp = rate > 0;
    const isDown = rate < 0;
    const rateText = `${isUp ? "+" : ""}${rate.toFixed(2)}%`;
    const changeClass = isUp ? "change-up" : isDown ? "change-down" : "change-flat";

    // 스코어 100점 만점 기준 미터기 시각화 (5개 세그먼트)
    const activeSegments = Math.round(((stock.score || 0) / 100) * 5);
    let meterHtml = '<div class="score-meter">';
    for (let i = 1; i <= 5; i++) {
      const onClass = i <= activeSegments ? "on" : "";
      meterHtml += `<span class="seg ${onClass}"></span>`;
    }
    meterHtml += "</div>";

    // 뱃지 스타일 맵핑
    const tags = (stock.signals || [])
      .map(sig => {
        let colorClass = 'vol';
        if (sig === 'RSI과매도탈출') colorClass = 'rsi';
        if (sig === 'MACD골든크로스') colorClass = 'macd';
        if (sig === '피보나치지지') colorClass = 'fibo';
        return `<span class="tag tag-${colorClass}">${sig}</span>`;
      })
      .join("");

    return `
      <tr>
        <td class="col-score">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight:700; color:var(--accent); font-family:var(--font-mono);">${stock.score || 0}</span>
            ${meterHtml}
          </div>
        </td>
        <td class="col-name">
          <span class="stock-name">${stock.name || "Unknown"}</span>
          <span class="stock-ticker">${stock.ticker || ""}</span>
          <span class="stock-market">${stock.market || ""}</span>
        </td>
        <td class="col-price">${stock.price ? stock.price.toLocaleString() : "-"}</td>
        <td class="col-change ${changeClass}">${rateText}</td>
        <td class="col-rsi">${stock.rsi ?? "-"}</td>
        <td class="col-vol">${stock.volume_ratio ? stock.volume_ratio + "x" : "-"}</td>
        <td class="col-tags"><div class="tag-list">${tags}</div></td>
      </tr>
    `;
  }

  function render() {
    const filtered = allStocks.filter(matchesFilter).filter(matchesSearch);
    const sorted = sortStocks(filtered);

    if (sorted.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">
        조건에 맞는 종목이 없습니다. 다른 필터나 검색어를 입력해보세요.
      </td></tr>`;
      return;
    }

    tableBody.innerHTML = sorted.map(renderRow).join("");
  }

  // ---- 이벤트 리스너 설정 ----

  searchBox.addEventListener("input", (e) => {
    currentSearch = e.target.value.trim();
    render();
  });

  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    render();
  });

  filterChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;

    filterChips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");

    currentFilter = btn.dataset.filter;
    render();
  });

  // 최초 초기화 로드
  loadData();
})();
