// js/detail.js
import { fetchStockData, formatCurrency } from './api.js';

async function initDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetTicker = urlParams.get('ticker');

    if (!targetTicker) {
        window.location.href = 'index.html';
        return;
    }

    const dataPool = await fetchStockData();
    const stock = dataPool[targetTicker];

    if (!stock) return;

    // 데이터 화면 출력 컴포넌트 치환
    const q = stock.quote || {};
    const s = stock.signal || {};
    const change = q.change || 0;
    const sign = change > 0 ? '+' : '';
    const colorClass = change > 0 ? 'up' : change < 0 ? 'down' : 'hold';

    document.getElementById('stockName').innerText = stock.name;
    document.getElementById('stockTicker').innerText = stock.ticker;
    document.getElementById('stockPrice').innerText = formatCurrency(q.price || 0, stock.market);
    
    const changeEl = document.getElementById('stockChange');
    changeEl.innerText = `${sign}${change} (${sign}${q.percent?.toFixed(2)}%)`;
    changeEl.className = colorClass;

    document.getElementById('aiScore').innerText = `${s.score || 0} / 100점`;
    document.getElementById('aiScore').className = colorClass;
    document.getElementById('aiSignal').innerText = s.signal || '분석중';
    document.getElementById('targetPrice').innerText = formatCurrency(s.target || 0, stock.market);
    document.getElementById('stopLossPrice').innerText = formatCurrency(s.stop || 0, stock.market);

    // 동적 뉴스 바인딩
    const newsContainer = document.getElementById('stockNewsContainer');
    if (newsContainer) {
        newsContainer.innerHTML = '';
        stock.news.forEach(n => {
            newsContainer.insertAdjacentHTML('beforeend', `<li class="news-item"><a href="#">${n.title}</a></li>`);
        });
    }

    // TradingView 위젯 동적 타겟 주입
    let tvSymbol = stock.market === "KR" ? `KRX:${stock.ticker}` : `NASDAQ:${stock.ticker}`;
    
    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "autosize": true,
            "symbol": tvSymbol,
            "interval": "D",
            "timezone": "Asia/Seoul",
            "theme": "dark",
            "style": "1",
            "locale": "ko",
            "container_id": "tvChartWidgetContainer"
        });
    }
}

document.addEventListener('DOMContentLoaded', initDetailPage);
