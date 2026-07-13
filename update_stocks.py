import json
import yfinance as yf
from datetime import datetime

# 1. 기존의 api/stocks.json 파일 읽기
try:
    with open('api/stocks.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception:
    data = {"stocks": {}}

# 웹사이트 티커와 야후 파이낸스 티커 매핑 (국내는 .KS 또는 .KQ 필요)
ticker_mapping = {
    "005930": "005930.KS",  # 삼성전자
    "000660": "000660.KS",  # SK하이닉스
    "451760": "451760.KQ",  # 컨텍
    "NVDA": "NVDA"          # 엔비디아
}

updated_stocks = {}

for web_ticker, yf_ticker in ticker_mapping.items():
    try:
        stock = yf.Ticker(yf_ticker)
        # 최근 2거래일간의 종가 데이터를 가져옴 (가장 에러 없이 안정적인 방식)
        hist = stock.history(period="2d")
        
        if len(hist) >= 2:
            current_price = hist['Close'].iloc[-1]
            prev_close = hist['Close'].iloc[-2]
        elif len(hist) == 1:
            current_price = hist['Close'].iloc[-1]
            prev_close = current_price
        else:
            raise ValueError("데이터를 가져오지 못했습니다.")
            
        # 변동률 계산
        change_pct = ((current_price - prev_close) / prev_close) * 100
        sign = "+" if change_pct > 0 else ""
        
        # 금액 포맷팅 (미국 주식은 달러 소수점, 한국 주식은 원화 정수형)
        if web_ticker == "NVDA":
            price_str = f"${current_price:,.2f}"
            change_str = f"{sign}{change_pct:.2f}%"
        else:
            price_str = f"{int(current_price):,}원"
            change_str = f"{sign}{change_pct:.2f}%"
            
        # 기존에 입력해 둔 종목 이름과 섹터는 그대로 유지하면서 주가만 갱신
        if web_ticker in data['stocks']:
            updated_stocks[web_ticker] = {
                "name": data['stocks'][web_ticker]['name'],
                "sector": data['stocks'][web_ticker]['sector'],
                "price": price_str,
                "change": change_str
            }
    except Exception as e:
        print(f"오류 발생 ({web_ticker}): {e}")
        if web_ticker in data['stocks']:
            updated_stocks[web_ticker] = data['stocks'][web_ticker]

# 데이터 최종 반영 및 저장
data['stocks'] = updated_stocks
with open('api/stocks.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 대시보드 업데이트 날짜도 오늘 날짜로 자동 변경
try:
    with open('api/signals.json', 'r', encoding='utf-8') as f:
        sig_data = json.load(f)
    sig_data['last_updated'] = datetime.today().strftime('%Y-%m-%d')
    with open('api/signals.json', 'w', encoding='utf-8') as f:
        json.dump(sig_data, f, ensure_ascii=False, indent=2)
except Exception as e:
    print(f"신호 파일 날짜 갱신 실패: {e}")
