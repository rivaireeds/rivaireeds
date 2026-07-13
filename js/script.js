// 페이지가 로드되면 자동으로 실시간 주가 파일을 읽어오는 함수
function loadLiveStockPrices() {
    // 깃허브 서버에 저장된 실시간 stocks.json 파일을 호출
    fetch('api/stocks.json')
        .then(response => response.json())
        .then(data => {
            const stocks = data.stocks;
            
            // 각 종목의 HTML 요소를 찾아 실시간 가격과 등락률로 글자 바꾸기
            // (HTML에 해당 id나 class가 지정되어 있어야 합니다)
            updateCard("005930", stocks["005930"]); // 삼성전자
            updateCard("451760", stocks["451760"]); // 컨텍
            updateCard("NVDA", stocks["NVDA"]);     // 엔비디아
            updateCard("000660", stocks["000660"]); // SK하이닉스
        })
        .catch(error => console.error("주가 연동 실패:", error));
}

// 개별 카드의 텍스트를 업데이트하는 보조 함수
function updateCard(ticker, stockData) {
    if (!stockData) return;
    
    // 예시: HTML에 주가를 표시하는 엘리먼트들을 찾아 텍스트 치환
    // 실제 작성하신 HTML 구조(클래스명 등)에 맞게 커스텀이 필요할 수 있습니다.
    const priceElement = document.querySelector(`[data-ticker="${ticker}"] .price`);
    const changeElement = document.querySelector(`[data-ticker="${ticker}"] .change`);
    
    if (priceElement) priceElement.innerText = stockData.price;
    if (changeElement) changeElement.innerText = stockData.change;
}

// 페이지 시작 시 실행
document.addEventListener("DOMContentLoaded", loadLiveStockPrices);
