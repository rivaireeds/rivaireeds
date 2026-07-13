// js/detail.js
import { fetchStockData, formatCurrency } from './api.js';

async function initDetailPage() {
    // 1. URL Parameter 파싱을 통한 타겟팅 Ticker 선별 추출
    const urlParams = new URLSearchParams(window.location.search);
    const targetTicker = urlParams.get('ticker');

    if (!targetTicker) {
        alert('잘못된 접근입니다. 대시보드로 이동합니다.');
        window.location.href = 'index.html';
        return;
    }

    // 2. 통합 데이터 팩 로드 및 대상 인덱스 탐색
    const dataPool = await fetchStockData();
    const stock = dataPool[targetTicker];

    if (!stock) {
        const content = document.querySelector('.main-content');
        if (content) {
            content.innerHTML = `<h2>종목 정보를 찾을 수 없습니다 (${targetTicker})</h2>`;
        }
        return;
    }

    // 3. UI 텍스트 컴포넌트 데이터 매핑 바인딩 (계산식 완전 배제)
    renderStockInfo(stock);

    // 4. TradingView 전용 고성능 기술적 차트 엔진 동적 인젝션
    renderTradingViewWidget(stock);
}

function renderStockInfo(stock) {
    const q = stock.quote || {};
    const s = stock.signal || {};

    const change = q.change || 0;
    const percent = q.percent || 0;
    const price = q.price || 0;

    document.getElementById('stockName').innerText = stock.name;
    document.getElementById('stockTicker').innerText = stock.ticker;
    document.getElementById('stockPrice').innerText = formatCurrency(price, stock.market);
    
    const sign = change > 0 ? '+' : '';
    const colorClass = change > 0 ? 'up' : change < 0 ? 'down' : 'hold';
    
    const changeEl = document.getElementById('stockChange');
    changeEl.innerText = `${sign}${change.toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
    changeEl.className = colorClass;

    document.getElementById('aiScore').innerText = `${s.score || 0} / 100점`;
    document.getElementById('aiScore').className = colorClass;
    document.getElementById('aiSignal').innerText = s.signal || '분석 정보 없음';
    document.getElementById('targetPrice').innerText = formatCurrency(s.target || 0, stock.market);
    document.getElementById('stopLossPrice').innerText = formatCurrency(s.stop || 0, stock.market);

    // 뉴스 바인딩 처리
    const newsContainer = document.getElementById('stockNewsContainer');
    if (newsContainer) {
        newsContainer.innerHTML = '';
        
        if (!stock.news || stock.news.length === 0) {
            newsContainer.innerHTML = '<li style="color:var(--text-secondary); font-size:14px;">최근 발행 뉴스가 없습니다.</li>';
            return;
        }

        stock.news.forEach(n => {
            const li = document.createElement('li');
            li.className = 'news-item';
            li.innerHTML = `<a href="#" onclick="alert('뉴스 본문으로 이동합니다.')">${n.title}</a>`;
            newsContainer.appendChild(li);
        });
    }
}

// TradingView Widget 컴파일 및 렌더 가이드 함수
function renderTradingViewWidget(stock) {
    let tradingViewSymbol = stock.ticker;
    if (stock.market === "KR") {
        tradingViewSymbol = `KRX:${stock.ticker}`;
    } else if (stock.market === "US") {
        tradingViewSymbol = `NASDAQ:${stock.ticker}`;
    }

    if (typeof TradingView !== 'undefined' && document.getElementById('tvChartWidgetContainer')) {
        new TradingView.widget({
            "autosize": true,
            "symbol": tradingViewSymbol,
            "interval": "D",
            "timezone": "Asia/Seoul",
            "theme": "dark",
            "style": "1",
            "locale": "ko",
            "toolbar_bg": "#f1f3f6",
            "enable_publishing": false,
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "container_id": "tvChartWidgetContainer"
        });
    }
}

document.addEventListener('DOMContentLoaded', initDetailPage);
