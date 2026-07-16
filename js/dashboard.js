/**
 * dashboard.js (국내 주식 전용)
 * data/signals.json 데이터를 읽어와 국내 주식 신호들을 렌더링합니다.
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
      const res = await fetch(`data/signals.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("signals.json을 찾을 수 없습니다.");
      
      const data = await res.json();
      if (!data) throw new Error("JSON 데이터 구조가 올바르지 않습니다.");

      document.getElementById("updateTime").textContent = data.update_time || "-";
      document.getElementById("statScanned").textContent =
        (data.total_scanned || 0).toLocaleString();
      document.getElementById("statSignals").textContent =
        (data.total_signals || 0).toLocaleString();

      allStocks = data.stocks && Array.isArray(data.stocks) ? data.stocks : [];
      render();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">
        데이터를 불러오지 못했습니다. <br>
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

    // 4대 신호 뱃지 스타일 매핑
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

  // Event Listeners
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

  loadData();
})();
