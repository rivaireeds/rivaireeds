// 대시보드에 표시할 종목 데이터 샘플 (필요에 따라 수정 가능)
const stockData = [
    { name: "한미반도체", ticker: "042700", price: "92,600원", sector: "semiconductor", signal: "buy", technique: "공구리 돌파", reason: "강한 거래량과 함께 매물대 상단 돌파 및 지지 확인" },
    { name: "SK하이닉스", ticker: "000660", price: "168,500원", sector: "semiconductor", signal: "hold", technique: "눌림목 매매", reason: "이평선 안착 구간 진입, 분할 매수 관점 유효" },
    { name: "한국항공우주", ticker: "047810", price: "53,100원", sector: "space", signal: "buy", technique: "공구리 돌파", reason: "우주 테마 수급 강세 포착, 박스권 상단 돌파 안착" },
    { name: "컨텍", ticker: "451760", price: "14,800원", sector: "space", signal: "buy", technique: "눌림목 매매", reason: "직전 고점 돌파 후 거래량 감소하며 눌림목 지지 형성" },
    { name: "솔트룩스", ticker: "304100", price: "24,150원", sector: "ai", signal: "buy", technique: "공구리 돌파", reason: "AI 모멘텀 거래량 대거 유입, 단기 저항선 돌파" },
    { name: "네이버", ticker: "035420", price: "192,000원", sector: "ai", signal: "hold", technique: "눌림목 매매", reason: "중기 이평선 부근 지지 테스트 중, 관망 후 진입" }
];

// 화면에 종목 카드를 동적으로 생성하는 함수
function renderStocks(data) {
    const grid = document.getElementById('stockGrid');
    grid.innerHTML = ''; // 기존 카드 초기화

    data.forEach(stock => {
        const card = document.createElement('div');
        card.className = `stock-card`;

        let signalText = '관망';
        if (stock.signal === 'buy') signalText = '매수';
        if (stock.signal === 'sell') signalText = '매도';

        card.innerHTML = `
            <div class="card-header">
                <span class="stock-name">${stock.name}</span>
                <span class="stock-ticker">${stock.ticker}</span>
            </div>
            <div class="card-body">
                <div class="price-row">
                    <span class="stock-price">${stock.price}</span>
                    <span class="signal-badge ${stock.signal}">${signalText}</span>
                </div>
            </div>
            <div class="card-footer">
                <div class="technique-tag">⚡ ${stock.technique}</div>
                <div class="reason-text">${stock.reason}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// 섹터 버튼 클릭 시 필터링하는 함수
function filterSector(sector) {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    event.target.classList.add('active');

    if (sector === 'all') {
        renderStocks(stockData);
    } else {
        const filtered = stockData.filter(stock => stock.sector === sector);
        renderStocks(filtered);
    }
}

// 페이지가 처음 로드될 때 실행
window.onload = function() {
    renderStocks(stockData);
};
