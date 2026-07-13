// js/api.js
export async function fetchStockData() {
    try {
        // 4개의 핵심 데이터소스를 동시에 병렬 처리(성능 최적화)
        const [stocksRes, quotesRes, signalsRes, newsRes] = await Promise.all([
            fetch('data/stocks.json').then(r => r.json()).catch(() => []),
            fetch('data/quotes.json').then(r => r.json()).catch(() => []),
            fetch('data/signals.json').then(r => r.json()).catch(() => []),
            fetch('data/news.json').then(r => r.json()).catch(() => [])
        ]);

        const mergedData = {};

        // 1. 기본 정보 매핑
        stocksRes.forEach(item => {
            mergedData[item.ticker] = { ...item, quote: {}, signal: {}, news: [] };
        });

        // 2. 실시간 가격 정보 결합
        quotesRes.forEach(item => {
            if (mergedData[item.ticker]) mergedData[item.ticker].quote = item;
        });

        // 3. AI 분석 신호 결과 결합
        signalsRes.forEach(item => {
            if (mergedData[item.ticker]) mergedData[item.ticker].signal = item;
        });

        // 4. 종목 매핑 뉴스 결합
        newsRes.forEach(item => {
            if (mergedData[item.ticker]) mergedData[item.ticker].news.push(item);
        });

        return mergedData;
    } catch (error) {
        console.error("Data Fetch Error:", error);
        return {};
    }
}

// 국가/통화 포맷팅 헬퍼 함수
export function formatCurrency(value, market) {
    if (market === "US") {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value) + "원";
}
