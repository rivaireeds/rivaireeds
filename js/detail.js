// js/detail.js
import { fetchStockData, formatCurrency } from './api.js';

async function initDetail() {
  // 1. 주소창 주소에서 ?ticker=XXXXXX 부분 추출하기
  const urlParams = new URLSearchParams(window.location.search);
  const ticker = urlParams.get('ticker');

  if (!ticker) {
    alert('올바르지 않은 접근입니다.');
    window.location.href = 'index.html';
    return;
  }

  // 2. 전체 데이터 바구니에서 클릭한 종목만 쏙 골라내기
  const allData = await fetchStockData();
  const stock = allData[ticker];

  if (!stock) {
    document.body.innerHTML = `<div style="color:white; padding:40px;">${ticker} 종목의 상세 데이터를 찾을 수 없습니다.</div>`;
    return;
  }

  // 3. 화면에 데이터 채워넣기
  renderDetailView(stock);
}

function renderDetailView(stock) {
  const marketType = stock.ticker.length === 6 ? 'KR' : 'US';

  // HTML 엘리먼트 안전 매핑 헬퍼
  const setHtml = (id, val) => { const el = document.getElementById(id); if(el) el.innerHTML = val; };
  const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

  // 기본 상단 정보
  setText('stockName', stock.name);
  setText('stockTicker', stock.ticker);
  setText('stockPrice', formatCurrency(stock.quote?.price || stock.price, marketType));
  setHtml('stockChange', stock.quote?.change || '-');

  // ⭐ [기술적 분석 데이터 연동]
  setText('tradingTechnique', stock.signal?.technique || '공구리 돌파 및 눌림목 매매');
  setText('waveTheory', stock.signal?.wave || '엘리어트 파동 1파 상승 진행 중');
  setText('aiScoreText', `${stock.signal?.score || 50}점`);

  // ⭐ [뉴스 리스트 동적 생성]
  const newsContainer = document.getElementById('newsList');
  if (newsContainer) {
    newsContainer.innerHTML = '';
    const newsArray = stock.news || [];
    if (newsArray.length === 0) {
      newsContainer.innerHTML = '<li style="color:#848e9c;">최근 관련 뉴스가 존재하지 않습니다.</li>';
    } else {
      newsArray.forEach(news => {
        const li = document.createElement('li');
        li.innerHTML = `
          <a href="${news.url || '#'}" target="_blank" style="color:#fff; text-decoration:none; display:block; padding:10px 0; border-bottom:1px solid #242b3d;">
            <div style="font-weight:bold; margin-bottom:4px;">${news.title}</div>
            <small style="color:#848e9c;">${news.date || ''} • ${news.source || '인공지능 뉴스엔진'}</small>
          </a>
        `;
        newsContainer.appendChild(li);
      });
    }
  }

  // ⭐ [실시간 트레이딩뷰 차트 자동 로드]
  loadTradingViewWidget(stock.ticker, marketType);
}

function loadTradingViewWidget(ticker, market) {
  const container = document.getElementById('chartContainer');
  if (!container) return;

  container.innerHTML = ''; // 기존 공간 비우기
  
  // 국내주식은 KRX:005930 형태로, 미국주식은 심볼 그대로 매핑
  const symbolPattern = market === 'KR' ? `KRX:${ticker}` : ticker;

  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/tv.js';
  script.async = true;
  script.onload = () => {
    if (typeof TradingView !== 'undefined') {
      new TradingView.widget({
        "width": "100%",
        "height": 450,
        "symbol": symbolPattern,
        "interval": "D",
        "timezone": "Asia/Seoul",
        "theme": "dark", // 대시보드와 어울리는 다크모드 차트
        "style": "1",
        "locale": "ko",
        "toolbar_bg": "#161a25",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "container_id": "chartContainer"
      });
    }
  };
  document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', initDetail);
