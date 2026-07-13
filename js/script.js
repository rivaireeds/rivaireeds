let currentTab = 'dashboard';

// 메뉴 전환 함수
function switchTab(tabName) {
    currentTab = tabName;
    
    // 버튼 활성화 스타일 제어
    const items = document.querySelectorAll('.nav-item');
    items.forEach(item => item.classList.remove('active'));
    event.target.classList.add('active');

    // 타이틀 및 내용 변경 처리
    const title = document.getElementById('page-title');
    const desc = document.getElementById('page-desc');
    
    if (tabName === 'dashboard') {
        title.innerText = "Dashboard";
        desc.innerText = "국내 및 미국 주식 AI 추천 매매 신호 현황";
        loadDashboardData();
    } else if (tabName === 'domestic') {
        title.innerText = "국내 주식";
        desc.innerText = "필수 테마(반도체, 우주항공, AI) 국내 포착 종목";
        loadMarketData('domestic');
    } else if (tabName === 'global') {
        title.innerText = "미국 주식";
        desc.innerText = "글로벌 강세 섹터 및 AI 기반 포착 종목";
        loadMarketData('global');
    } else if (tabName === 'news') {
        title.innerText = "오늘의 뉴스";
        desc.innerText = "매매 신호 분석에 영향을 준 실시간 주요 시황 뉴스";
        loadNewsData();
    } else {
        document.getElementById('content-body').innerHTML = `<div class="empty-msg">현재 준비 중인 메뉴입니다 (${tabName})</div>`;
    }
}

// 대시보드 데이터 패칭 및 통합 데이터 뷰 구현
function loadDashboardData() {
    Promise.all([
        fetch('api/stocks.json').then(res => res.json()),
        fetch('api/signals.json').then(res => res.json())
    ]).then(([stockRes, signalRes]) => {
        renderStockCards(signalRes.signals, stockRes.stocks);
    });
}

// 국가별 시장 필터 데이터 로드
function loadMarketData(marketType) {
    Promise.all([
        fetch('api/stocks.json').then(res => res.json()),
        fetch('api/signals.json').then(res => res.json())
    ]).then(([stockRes, signalRes]) => {
        const filteredSignals = signalRes.signals.filter(s => s.market === marketType);
        renderStockCards(filteredSignals, stockRes.stocks);
    });
}

// 종목 카드를 화면에 그리는 공통 모듈
function renderStockCards(signals, stocks) {
    const body = document.getElementById('content-body');
    body.innerHTML = '';

    if(signals.length === 0) {
        body.innerHTML = '<div class="empty-msg">포착된 신호 종목이 없습니다.</div>';
        return;
    }

    signals.forEach(sig => {
        const info = stocks[sig.ticker];
        if(!info) return;

        const card = document.createElement('div');
        card.className = 'stock-card';
        // 클릭 시 stock.html 구조로 동적 파라미터 이동
        card.onclick = () => { window.location.href = `stock.html?ticker=${sig.ticker}`; };

        card.innerHTML = `
            <div class="card-header">
                <span class="stock-name">${info.name}</span>
                <span class="stock-ticker">${sig.ticker}</span>
            </div>
            <div class="card-price-row">
                <span class="stock-price">${info.price} (${info.change})</span>
                <span class="signal-badge ${sig.signal}">${sig.signal.toUpperCase()}</span>
            </div>
            <div class="card-footer-info">
                <span class="tech-badge">⚡ ${sig.technique}</span>
            </div>
        `;
        body.appendChild(card);
    });
}

// 뉴스 데이터 렌더링
function loadNewsData() {
    fetch('api/news.json')
        .then(res => res.json())
        .then(data => {
            const body = document.getElementById('content-body');
            body.innerHTML = '';
            
            data.news.forEach(n => {
                const item = document.createElement('div');
                item.className = 'news-item';
                item.innerHTML = `
                    <div class="news-cat">[${n.category}]</div>
                    <div class="news-title">${n.title}</div>
                    <div class="news-time">${n.time}</div>
                `;
                body.appendChild(item);
            });
        });
}

// 페이지 최초 진입 시 대시보드 로드
window.onload = () => { loadDashboardData(); };
