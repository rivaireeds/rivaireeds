// js/dashboard.js
import { fetchStockData, formatCurrency } from './api.js';

let allStocks = {};
let currentFilter = 'all'; // 'all', 'KR', 'US', 'signal'

async function initDashboard() {
  // api.js를 통해 병합된 데이터 가져오기
  allStocks = await fetchStockData();
  renderDashboard();
  setupSidebar();
}

function renderDashboard() {
  const container = document.getElementById('stockGridContainer');
  if (!container) return;
  container.innerHTML = '';

  const stocksArray = Object.values(allStocks);

  // 1. 선택한 메뉴에 따른 데이터 필터링 규칙
  const filtered = stocksArray.filter(stock => {
    const ticker = stock.ticker || '';
    const isKR = ticker.length === 6; // 6자리 코드면 국내주식
    
    if (currentFilter === 'KR') return isKR;
    if (currentFilter === 'US') return !isKR;
    if (currentFilter === 'signal') {
      // AI점수가 70점 이상이거나 BUY 신호인 것만 필터링
      const score = parseInt(stock.signal?.score || stock.score || 0);
      return score >= 70 || stock.signal?.text === 'BUY' || stock.signal?.text === '매수';
    }
    return true; // 'all' (전체보기)
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: #848e9c; padding: 20px;">해당하는 종목이 없습니다.</div>';
    return;
  }

  // 2. 필터링된 주식 카드 화면에 그리기
  filtered.forEach(stock => {
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.style.cursor = 'pointer'; // 마우스 커서를 손가락 모양으로 변경
    
    // ⭐ [핵심 FIX] 카드 클릭 시 상세 페이지로 ticker 값을 가지고 이동하도록 설정
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
    
    // 등락률에 따른 글자 색상 클래스 판별
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

// ⭐ [핵심 FIX] 좌측 메뉴 클릭 시 화면 데이터를 필터링해주는 이벤트 리스너 설정
function setupSidebar() {
  const navItems = document.querySelectorAll('.sidebar .nav-menu li');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // 기존 활성화된 메뉴 클래스 제거 후 클릭한 메뉴에 활성화 클래스 부여
      navItems.forEach(i => i.classList.remove('active', 'nav-item-active'));
      item.classList.add('active');

      const menuText = item.textContent;
      if (menuText.includes('Dashboard')) currentFilter = 'all';
      else if (menuText.includes('국내주식')) currentFilter = 'KR';
      else if (menuText.includes('미국주식')) currentFilter = 'US';
      else if (menuText.includes('AI 매수신호')) currentFilter = 'signal';

      // 필터 변경 후 대시보드 다시 그리기
      renderDashboard();
    });
  });
}

document.addEventListener('DOMContentLoaded', initDashboard);
