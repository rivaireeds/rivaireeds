js/dashboard.js
import { fetchStockData, formatCurrency } from './api.js';

let localCacheData = {};
let currentMarketFilter = 'ALL';

async function initDashboard() {
    const container = document.getElementById('stockGridContainer');
    if (!container) return;
    
    localCacheData = await fetchStockData();
    renderCards();
    setupFilters();
}

function renderCards(filterQuery = '') {
    const container = document.getElementById('stockGridContainer');
    container.innerHTML = '';

    Object.values(localCacheData).forEach(stock => {
        // 국가 탭 필터링 조건 분기
        if (currentMarketFilter !== 'ALL' && stock.market !== currentMarketFilter) return;
        
        // 실시간 검색창 매칭 분기
        if (filterQuery && !stock.ticker.toLowerCase().includes(filterQuery) && !stock.name.toLowerCase().includes(filterQuery)) return;

        const q = stock.quote || {};
        const s = stock.signal || {};
        
        const change = q.change || 0;
        const percent = q.percent || 0;
        
        const colorClass = change > 0 ? 'up' : change < 0 ? 'down' : 'hold';
        const bgClass = s.score >= 80 ? 'bg-up' : s.score <= 40 ? 'bg-down' : 'bg-hold';
        const sign = change > 0 ? '+' : '';

        const cardHtml = `
            <a href="stock.html?ticker=${stock.ticker}" class="stock-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${stock.name}</div>
                        <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${stock.sector}</div>
                    </div>
                    <span class="card-ticker">${stock.ticker}</span>
                </div>
                <div class="card-body">
                    <div class="price-row">${formatCurrency(q.price || 0, stock.market)}</div>
                    <div class="change-row ${colorClass}">
                        ${sign}${change} (${sign}${percent.toFixed(2)}%)
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

function setupFilters() {
    document.getElementById('dashboardSearch')?.addEventListener('input', (e) => {
        renderCards(e.target.value.toLowerCase().trim());
    });

    document.getElementById('filterKR')?.addEventListener('click', (e) => {
        e.preventDefault(); currentMarketFilter = 'KR'; renderCards();
    });
    
    document.getElementById('filterUS')?.addEventListener('click', (e) => {
        e.preventDefault(); currentMarketFilter = 'US'; renderCards();
    });
}

document.addEventListener('DOMContentLoaded', initDashboard);
