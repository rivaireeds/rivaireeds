// js/api.js
export async function fetchStockData() {
  try {
    // 파일이 없거나 404 에러가 나도 빈 배열로 안전하게 처리되도록 개선
    const [stocksRes, quotesRes, signalsRes, newsRes] = await Promise.all([
      fetch('api/stocks.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('api/quotes.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('api/signals.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('api/news.json').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);

    const mergedData = {};

    // 데이터가 배열이 아니라 객체(디바이스/딕셔너리) 형태로 들어와도 안전하게 배열로 변환하는 헬퍼 함수
    const ensureArray = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (typeof data === 'object') return Object.values(data);
      return [];
    };

    const stocksList = ensureArray(stocksRes);
    const quotesList = ensureArray(quotesRes);
    const signalsList = ensureArray(signalsRes);
    const newsList = ensureArray(newsRes);

    // 1. 기본 주식 정보 매핑
    stocksList.forEach(item => {
      if (item && item.ticker) {
        mergedData[item.ticker] = { ...item, quote: {}, signal: {}, news: [] };
      }
    });

    // 2. 현재가 및 등락률 정보 매핑
    quotesList.forEach(item => {
      if (item && item.ticker && mergedData[item.ticker]) {
        mergedData[item.ticker].quote = item;
      }
    });

    // 3. AI 매매 신호 매핑
    signalsList.forEach(item => {
      if (item && item.ticker && mergedData[item.ticker]) {
        mergedData[item.ticker].signal = item;
      }
    });

    // 4. 관련 뉴스 매핑
    newsList.forEach(item => {
      if (item && item.ticker && mergedData[item.ticker]) {
        mergedData[item.ticker].news.push(item);
      }
    });

    return mergedData;
  } catch (error) {
    console.error("Data Load Error:", error);
    return {};
  }
}

// 금액 포맷팅 함수 (값이 비어있을 때의 예외 처리 추가)
export function formatCurrency(value, market) {
  if (value === undefined || value === null || isNaN(value)) return "-";
  
  if (market === "US") {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  return new Intl.NumberFormat('ko-KR').format(value) + "원";
}
