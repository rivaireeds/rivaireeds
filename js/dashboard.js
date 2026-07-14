// js/dashboard.js
import { fetchStockData, formatCurrency } from './api.js';

let allStocks = {};
let currentFilter = 'all'; // 필터링 상태: 'all', 'KR', 'US', 'signal'

async function initDashboard() {
  // api.js를 통해 실시간 병합 데이터를 수집
  allStocks = await fetchStockData();
  renderDashboard();
  setupSidebar();
}

function renderDashboard() {
  // ⭐ [오타 해결] getElementById의 'Id' 대소문자를 정확히 수정했습니다.
  const container = document.getElementById('stockGridContainer');
  if (!container) return;
  container.innerHTML = '';

  const stocksArray = Object.values(allStocks);

  // 1. 선택한 메뉴 탭에 따른 데이터 필터링 규칙 적용
  const filtered = stocksArray.filter(stock => {
    const ticker = stock.ticker || '';
    const isKR = ticker.length === 6; // 6자리 코드면 국내주식
    
    if (currentFilter === 'KR') return isKR;
    if (currentFilter === 'US') return !isKR;
    if (currentFilter === 'signal') {
      // AI점수가 70점 이상이거나 BUY(매수) 신호인 것만 필터링
      const score = parseInt(stock.signal?.score || stock.score || 0);
      return score >= 70 || stock.signal?.text === 'BUY' || stock.signal?.text === '매수';
    }
    return true; // 'all' (전체보기)
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: #848e9c; padding: 20px;">해당하는 종목이 없습니다.</div>';
    return;
  }

  // 2. 필터링된 주식들로 카드 생성 및 렌더링
  filtered.forEach(stock => {
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.style.cursor = 'pointer'; // 클릭할 수 있는 직관적인 커서 모양 제공
    
    // ⭐ [카드 클릭 기능] 클릭 시 상세 페이지(stock.html)로 해당 종목 코드와 함께 이동
    card.onclick = () => {
      window.location.href = `stock.html?ticker=${stock.ticker}`;
    };

    const name = stock.name || '종목명';
    const ticker = stock.ticker || '';
    const tag = stock.tag || stock.category || '';
    const price = stock.quote?.price || stock.price || 0;
    const changeText = stock.quote?.change || '-';
    const score = stock.signal?.score || stock.score || '50';
    const signalText = stock.signal?.text || '관망';

    const marketType = ticker.length === 6 ? 'KR' : 'US';
    const formattedPrice = formatCurrency(price, marketType);
    
    // 등락 부호에 따른 텍스트 컬러 지정 (하락은 down, 상승은 up)
    const isMinus = changeText.includes('-');
    const colorClass = isMinus ? 'down' : 'up';

    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="stock-name">${name}</h3>
          <span class="stock-tag">${tag}</span>
        </div>
        <span class="stock-ticker">${ticker}</span>
      </div>
      <div class="card-body">
        <div class="stock-price">${formattedPrice}</div>
        <div class="stock-change ${colorClass}">${changeText}</div>
      </div>
      <div class="card-footer">
        <span class="signal-badge">${signalText}</span>
        <span class="score-tag">${score}점</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// 3. 사이드바(좌측 메뉴) 탭 클릭에 따른 이벤트 연동 함수
function setupSidebar() {
  const navItems = document.querySelectorAll('.sidebar .nav-menu li');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // 활성화된 메뉴 하이라이팅 처리
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const menuText = item.textContent;
      if (menuText.includes('Dashboard')) currentFilter = 'all';
      else if (menuText.includes('국내주식')) currentFilter = 'KR';
      else if (menuText.includes('미국주식')) currentFilter = 'US';
      else if (menuText.includes('AI 매수신호')) currentFilter = 'signal';

      // 필터 적용 후 대시보드 새로
