/**
 * dashboard.js (국내 주식 전용 + 실시간 차트 + 관심종목)
 * data/signals.json 데이터를 읽어와 렌더링하고 차트 로드 및 북마크 기능을 제공합니다.
 */

(function () {
  let allStocks = [];
  let currentFilter = "ALL";
  let currentSort = "score_desc";
  let currentSearch = "";
  
  // 브라우저 캐시에 관심종목(티커 목록) 보관
  let favorites = JSON.parse(localStorage.getItem("kr_signals_favs")) || [];

  const tableBody = document.getElementById("tableBody");
  const searchBox = document.getElementById("searchBox");
  const sortSelect = document.getElementById("sortSelect");
  const filterChips = document.getElementById("filterChips");
  
  // 상세 패널 요소
  const detailPanel = document.getElementById("detailPanel");
  const panelPlaceholder = document.getElementById("panelPlaceholder");
  const panelContent = document.getElementById("panelContent");
  const panelStockName = document.getElementById("panelStockName");
  const panelStockTicker = document.getElementById("panelStockTicker");
  const panelStockMarket = document.getElementById("panelStockMarket");
  const panelFavBtn = document.getElementById("panelFavBtn");
  const panelScore = document.getElementById("panelScore");
  const panelPositionText = document.getElementById("panelPositionText");
  const panelBadges = document.getElementById("panelBadges");

  let selectedTicker = null;

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
      updateFavCount();
      render();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="8" class="empty-state">
        데이터를 불러오지 못했습니다. <br>
        <span style="font-size: 11px; color: var(--text-dim);">${err.message}</span>
      </td></tr>`;
      console.error(err);
    }
  }

  // 관심 종목 수량 업데이트
  function updateFavCount() {
    document.getElementById("statFavorites").textContent = favorites.length;
  }

  // 관심 종목 토글 함수
  function toggleFavorite(ticker) {
    if (favorites.includes(ticker)) {
      favorites = favorites.filter(t => t !== ticker);
    } else {
      favorites.push(ticker);
    }
    localStorage.setItem("kr_signals_favs", JSON.stringify(favorites));
    updateFavCount();
    render();
    
    // 우측 패널 버튼 상태도 연동
    if (selectedTicker === ticker) {
      updatePanelFavBtnState(ticker);
    }
  }

  function updatePanelFavBtnState(ticker) {
    if (favorites.includes(ticker)) {
      panelFavBtn.classList.add("active");
      panelFavBtn.textContent = "★ 관심 해제";
    } else {
      panelFavBtn.classList.remove("active");
      panelFavBtn.textContent = "☆ 관심 등록";
    }
  }

  // 필터 판정
  function matchesFilter(stock) {
    if (currentFilter === "ALL") return true;
    if (currentFilter === "FAVORITE") {
      return favorites.includes(stock.ticker);
    }
    const signals = stock.signals || [];
    return signals.includes(currentFilter);
  }

  // 검색 판정
  function matchesSearch(stock) {
    if (!currentSearch) return true;
    const query = currentSearch.toLowerCase();
    const name = (stock.name || "").toLowerCase();
    const ticker = stock.ticker || "";
    return name.includes(query) || ticker.includes(query);
  }

  // 정렬
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

  // 테이블 행 그리기
  function renderRow(stock) {
    const ticker = stock.ticker;
    const rate = stock.rate || 0;
    const isUp = rate > 0;
    const isDown = rate < 0;
    const rateText = `${isUp ? "+" : ""}${rate.toFixed(2)}%`;
    const changeClass = isUp ? "change-up" : isDown ? "change-down" : "change-flat";
    
    const isFav = favorites.includes(ticker);
    const favStarClass = isFav ? "active" : "";
    const selectedClass = selectedTicker === ticker ? "selected" : "";

    const activeSegments = Math.round(((stock.score || 0) / 100) * 5);
    let meterHtml = '<div class="score-meter">';
    for (let i = 1; i <= 5; i++) {
      const onClass = i <= activeSegments ? "on" : "";
      meterHtml += `<span class="seg ${onClass}"></span>`;
    }
    meterHtml += "</div>";

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
      <tr class="${selectedClass}" data-ticker="${ticker}">
        <td style="text-align:center;">
          <span class="fav-star ${favStarClass}" data-fav-ticker="${ticker}">★</span>
        </td>
        <td class="col-score">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight:700; color:var(--accent); font-family:var(--font-mono);">${stock.score || 0}</span>
            ${meterHtml}
          </div>
        </td>
        <td class="col-name">
          <span class="stock-name">${stock.name || "Unknown"}</span>
          <span class="stock-ticker">${ticker || ""}</span>
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
      tableBody.innerHTML = `<tr><td colspan="8" class="empty-state">
        조건에 맞는 종목이 없습니다. 다른 필터나 검색어를 입력해보세요.
      </td></tr>`;
      return;
    }

    tableBody.innerHTML = sorted.map(renderRow).join("");
  }

  // 📈 특정 종목의 우측 미니 차트 & 정밀 정보 띄우기
  function selectStock(ticker) {
    selectedTicker = ticker;
    const stock = allStocks.find(s => s.ticker === ticker);
    if (!stock) return;

    // 테이블 상에서 선택된 행 하이라이트 유지
    document.querySelectorAll("#tableBody tr").forEach(tr => {
      tr.classList.remove("selected");
      if (tr.dataset.ticker === ticker) tr.classList.add("selected");
    });

    // 상세 패널 구조 활성화
    panelPlaceholder.classList.add("hidden");
    panelContent.classList.remove("hidden");

    panelStockName.textContent = stock.name;
    panelStockTicker.textContent = stock.ticker;
    panelStockMarket.textContent = stock.market;
    panelScore.textContent = `${stock.score}점`;

    updatePanelFavBtnState(ticker);

    // 위치 텍스트 조건 매핑
    let positionText = "현재 지지 저항을 확인하며 차트 추세를 생성 중입니다.";
    if
