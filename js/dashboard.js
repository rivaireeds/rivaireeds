// js/dashboard.js
import { fetchStockData, formatCurrency } from './api.js';

let localCacheData = {};

async function initDashboard() {
    const container = document.getElementById('stockGridContainer');
    if (!container) return;
    
    container.innerHTML = '<div style="color: var(--text-secondary)">데이터를 불러오는 중...</div>';

    // 정규화된 마스터 데이터 셋 로드
    localCacheData = await fetchStockData();
    renderCards(localCacheData);
    setupSearch();
}

function renderCards(dataList) {
    const container = document.getElementById('stockGridContainer');
    if (!container) return;
    container.innerHTML = '';

    const items = Object.values(dataList);
    if (items.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary)">표시할 종목이 없습니다.</div>';
        return;
    }

    items.forEach(stock => {
        const q = stock.quote || {};
        const s = stock.signal || {};
        
        const change = q.change || 0;
        const percent = q.percent || 0;
        const price = q.price || 0;
        
        // 등락률에 따른 유동 컬러 클래스 분기 지정
        const colorClass = change > 0 ? 'up' : change < 0 ? 'down' : 'hold';
        const bgClass = s.score >= 80 ? 'bg-up' : s.score <= 40 ? 'bg-down' : 'bg-hold';
        const sign = change > 0 ? '+' : '';

        const cardHtml = `
            <a href="stock.html?ticker=${stock.ticker}" class="stock-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${stock.name}</div>
                        <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${stock.sector || '미분류'}</div>
                    </div>
                    <span class="card-ticker">${stock.ticker}</span>
                </div>
                <div class="card-body">
                    <div class="price-row">${formatCurrency(price, stock.market)}</div>
                    <div class="change-row ${colorClass}">
                        ${sign}${change.toFixed(2)} (${sign}${percent.toFixed(2)}%)
                    </div>
                </div>
                <div class="card-footer">
                    <span class="signal-badge ${bgClass}">${s.signal || '관망'}</span>
                    <span class="score-text ${colorClass}">${s.score || 0}점</span>
                </div>
            </a>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// 주식 실시간 초고속 매칭 검색 엔진
function setupSearch() {
    const searchInput = document.getElementById('dashboardSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (!query) {
            renderCards(localCacheData);
            return;
        }

        const filtered = {};
        Object.keys(localCacheData).forEach(ticker => {
            const stock = localCacheData[ticker];
            if (ticker.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query)) {
                filtered[ticker] = stock;
            }
        });
        renderCards(filtered);
    });
}

document.addEventListener('DOMContentLoaded', initDashboard);
