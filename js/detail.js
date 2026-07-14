// js/api.js
export async function fetchStockData() {
  try {
    const [stocksRes, quotesRes, signalsRes, newsRes] = await Promise.all([
      fetch('api/stocks.json').then(r => r.json()).catch(() => []),
      fetch('api/quotes.json').then(r => r.json()).catch(() => []),
      fetch('api/signals.json').then(r => r.json()).catch(() => []),
      fetch('api/news.json').then(r => r.json()).catch(() => [])
    ]);

    const mergedData = {};

    stocksRes.forEach(item => {
      mergedData[item.ticker] = { ...item, quote: {}, signal: {}, news: [] };
    });

    quotesRes.forEach(item => {
      if (mergedData[item.ticker]) mergedData[item.ticker].quote = item;
    });

    signalsRes.forEach(item => {
      if (mergedData[item.ticker]) mergedData[item.ticker].signal = item;
    });

    newsRes.forEach(item => {
      if (mergedData[item.ticker]) {
        // 기존에 news 배열이 없으면 초기화 후 밀어넣기
        if (!mergedData[item.ticker].news) {
          mergedData[item.ticker].news = [];
        }
        mergedData[item.ticker].news.push(item);
      }
    });

    return mergedData;
  } catch (error) {
    console.error("Data Load Error:", error);
    return {};
  }
}

export function formatCurrency(value, market) {
  if (value === undefined || value === null) return '-';
  if (market === "US") {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  return new Intl.NumberFormat('ko-KR').format(value) + "원";
}
