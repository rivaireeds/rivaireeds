function loadTradingViewWidget(ticker, market) {
  const container = document.getElementById('chartContainer');
  if (!container) return;

  container.innerHTML = ''; // 기존 차트 영역 비우기
  
  // 국내주식은 KRX:005930, 미국주식은 NVIDIA 등 그대로 매핑
  const symbolPattern = market === 'KR' ? `KRX:${ticker}` : ticker;

  // 1. 트레이딩뷰 고급 차트 컨테이너 생성
  const widgetContainer = document.createElement('div');
  widgetContainer.className = 'tradingview-widget-container';
  widgetContainer.style.height = '100%';
  widgetContainer.style.width = '100%';

  const targetDiv = document.createElement('div');
  targetDiv.id = 'tradingview_advanced_chart';
  targetDiv.style.height = '450px'; // 차트 높이 설정
  
  widgetContainer.appendChild(targetDiv);
  container.appendChild(widgetContainer);

  // 2. 고급 차트 전용 스크ript 동적 로드
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/tv.js';
  script.type = 'text/javascript';
  script.async = true;
  
  script.onload = () => {
    if (typeof TradingView !== 'undefined') {
      new TradingView.widget({
        "autosize": true,
        "symbol": symbolPattern,
        "interval": "D",
        "timezone": "Asia/Seoul",
        "theme": "dark",        // 대시보드와 어울리는 다크 테마
        "style": "1",           // 캔들 차트 형태
        "locale": "ko",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "container_id": "tradingview_advanced_chart"
      });
    }
  };
  
  document.head.appendChild(script);
}
