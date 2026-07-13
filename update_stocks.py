import json
import yfinance as yf
from datetime import datetime

# 1. 기존 데이터 읽기 (없거나 비어있으면 기본 구조 생성)
try:
    with open('api/stocks.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception:
    data = {"stocks": {}}

if 'stocks' not in data:
    data['stocks'] = {}

# 파일이 비어있을 때를 대비한 기본 종목 정보 세팅
default_info = {
    "005930": {"name": "삼성전자", "sector": "반도체"},
    "000660": {"name": "SK하이닉스", "sector": "반도체"},
    "451760": {"name": "컨텍", "sector": "우주항공"},
    "NVDA": {"name": "NVIDIA", "sector": "인공지능"}
}

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
            
        # 기존 파일에 해당 종목 정보가 있으면 유지, 없으면 기본값에서 가져옴
        if web_ticker in data['stocks']:
            name = data['stocks'][web_ticker].get('name', default_info[web_ticker]['name'])
            sector = data['stocks'][web_ticker].get('sector', default_info[web_ticker]['sector'])
        else:
            name = default_info[web_ticker]['name']
            sector = default_info[web_ticker]['sector']
            
        updated_stocks[web_ticker] = {
            "name": name,
            "sector": sector,
            "price": price_str,
            "change": change_str
        }
    except Exception as e:
        print(f"오류 발생 ({web_ticker}): {e}")
        if web_ticker in data['stocks']:
            updated_stocks[web_ticker] = data['stocks'][web_ticker]
        else:
            updated_stocks[web_ticker] = {
                "name": default_info[web_ticker]['name'],
                "sector": default_info[web_ticker]['sector'],
                "price": "데이터 오류",
                "change": "0.00%"
            }

# 데이터 최종 반영 및 저장
data['stocks'] = updated_stocks
with open('api/stocks.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 대시보드 업데이트 날짜도 오늘 날짜로 자동 변경
try:
    with open('api/signals.json', 'r', encoding='utf-8') as f:
        sig_data = json.load(f)
except Exception:
    sig_data = {"last_updated": ""}

sig_data['last_updated'] = datetime.today().strftime('%Y-%m-%d')

with open('api/signals.json', 'w', encoding='utf-8') as f:
    json.dump(sig_data, f, ensure_ascii=False, indent=2)
