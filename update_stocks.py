# -*- coding: utf-8 -*-
"""
update_stocks.py
=================
국내 전 종목(KOSPI, KOSDAQ 보통주)만을 대상으로 4대 핵심 매수 신호를 초고속 연산합니다.
미국 주식 및 기타 해외 주식은 완전히 차단하고 국내 주식만 정밀 추적합니다.
"""

import json
import os
import sys
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from pykrx import stock

def get_nearest_business_days():
    """안정적인 지표 산출을 위해 최근 120일 중 영업일을 역순 확보합니다."""
    today = datetime.now()
    dates = []
    for i in range(120):
        day = today - timedelta(days=i)
        if day.weekday() < 5:
            dates.append(day.strftime("%Y%m%d"))
    return sorted(dates)

def main():
    print(f"[{datetime.now()}] 🚀 [국내 주식 전용] 4대 핵심 신호 초고속 엔진 기동...")
    os.makedirs("data", exist_ok=True)

    business_days = get_nearest_business_days()
    if len(business_days) < 40:
        print("❌ 유효한 국내 영업일 데이터를 확보하지 못했습니다.")
        return

    # 당일 혹은 최신 거래일 확정
    todate = business_days[-1]
    
    try:
        print(f"📊 {todate} 국내 시장 데이터 일괄 수집 중...")
        df_today = stock.get_market_ohlcv_by_ticker(todate, market="ALL")
        if df_today.empty or df_today['종가'].sum() == 0:
            todate = business_days[-2]
            print(f"⚠️ 직전 영업일 데이터로 전환 조회합니다: {todate}")
            df_today = stock.get_market_ohlcv_by_ticker(todate, market="ALL")

        if df_today.empty:
            print("❌ 당일 데이터를 조회할 수 없습니다.")
            return

        df_today = df_today.reset_index()
        df_today.rename(columns={'티커': 'ticker', '종가': 'price', '등락률': 'change_rate', '거래량': 'volume', '고가': 'high', '저가': 'low'}, inplace=True)
        
        # 딕셔너리 구조를 사용해 연산 처리 속도를 극대화합니다.
        price_history = {row['ticker']: [int(row['price'])] for _, row in df_today.iterrows()}
        high_history = {row['ticker']: [int(row['high'])] for _, row in df_today.iterrows()}
        low_history = {row['ticker']: [int(row['low'])] for _, row in df_today.iterrows()}
        volume_history = {row['ticker']: [int(row['volume'])] for _, row in df_today.iterrows()}

        # 지표 연산용 과거 40영업일 데이터 청크 일괄 로드
        target_past_days = business_days[-40:-1]
        print("📈 지표 계산을 위한 과거 주가 매트릭스 구성 중 (약 15초 소요)...")
        for day in target_past_days:
            df_past = stock.get_market_ohlcv_by_ticker(day, market="ALL")
            if df_past.empty:
                continue
            df_past = df_past.reset_index()
            for _, row in df_past.iterrows():
                t = row['티커']
                if t in price_history:
                    price_history[t].append(int(row['종가']))
                    high_history[t].append(int(row['고가']))
                    low_history[t].append(int(row['저가']))
                    volume_history[t].append(int(row['거래량']))

        results = []

        for _, row in df_today.iterrows():
            ticker = row['ticker']
            price = int(row['price'])
            volume = int(row['volume'])
            rate = float(row['change_rate'])
            
            # 거래정지 상태이거나 동전주 등 왜곡 위험 종목 제외
            if price < 500 or volume == 0:
                continue

            name = stock.get_market_ticker_name(ticker)
            
            # 🚨 국내 잡주/우선주/ETF/스팩(SPAC) 원천 필터링
            if not name or "우" in name[-1:] or "우B" in name or "우C" in name or "스팩" in name or name.endswith("스팩"):
                continue
            if "KODEX" in name or "TIGER" in name or "KBSTAR" in name or "HANARO" in name or "ACE" in name or "SOL" in name:
                continue

            market_type = "KOSPI" if ticker in stock.get_market_ticker_list(market="KOSPI") else "KOSDAQ"

            # 과거 시계열 데이터 복원 (시간순 정렬)
            p_list = price_history.get(ticker, [price])[::-1]
            h_list = high_history.get(ticker, [int(row['high'])])[::-1]
            l_list = low_history.get(ticker, [int(row['low'])])[::-1]
            v_list = volume_history.get(ticker, [volume])[::-1]

            if len(p_list) < 30:
                continue

            p_series = pd.Series(p_list)
            
            # 1. 거래량 급증 계산
            avg_vol_20 = np.mean(v_list[-21:-1]) if len(v_list) >= 21 else np.mean(v_list)
            volume_ratio = round(volume / avg_vol_20, 2) if avg_vol_20 > 0 else 1.0

            # 2. RSI 계산 (14)
            delta = p_series.diff()
            up = delta.clip(lower=0)
            down = -1 * delta.clip(upper=0)
            ema_up = up.ewm(com=13, adjust=False).mean()
            ema_down = down.ewm(com=13, adjust=False).mean()
            rs = ema_up / ema_down.replace(0, np.nan)
            rsi_series = 100 - (100 / (1 + rs))
            rsi = round(rsi_series.iloc[-1], 1) if not np.isnan(rsi_series.iloc[-1]) else 50
            prev_rsi = round(rsi_series.iloc[-2], 1) if len(rsi_series) > 1 else 50

            # 3. MACD 계산 (12, 26, 9)
            ema12 = p_series.ewm(span=12, adjust=False).mean()
            ema26 = p_series.ewm(span=26, adjust=False).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9, adjust=False).mean()
            
            macd_today, macd_prev = macd_line.iloc[-1], macd_line.iloc[-2]
            sig_today, sig_prev = signal_line.iloc[-1], signal_line.iloc[-2]

            # 4. 피보나치 지지 계산 (최근 30영업일 최고/최저 기준)
            recent_high = max(h_list[-30:])
            recent_low = min(l_list[-30:])
            diff = recent_high - recent_low
            
            fib_support = False
            if diff > 0:
                levels = [recent_high - (diff * 0.382), recent_high - (diff * 0.5), recent_high - (diff * 0.618)]
                for lvl in levels:
                    # 현재가가 피보나치 지지선 오차범위 ±1.5% 이내에 수렴하는지 체크
                    if lvl * 0.985 <= price <= lvl * 1.015:
                        fib_support = True
                        break

            detected_signals = []
            score = 0

            # 신호 1: RSI 과매도 탈출 (30점)
            if prev_rsi <= 30 < rsi:
                detected_signals.append("RSI과매도탈출")
                score += 30

            # 신호 2: 거래량 급증 (30점)
            if volume_ratio >= 2.0 and volume > 50000:
                detected_signals.append("거래량급증")
                score += 30

            # 신호 3: MACD 골든크로스 (25점)
            if macd_prev <= sig_prev and macd_today > sig_today:
                detected_signals.append("MACD골든크로스")
                score += 25

            # 신호 4: 피보나치 지지 (15점)
            if fib_support:
                detected_signals.append("피보나치지지")
                score += 15

            # 최소 1개 이상 유의미한 기술적 타이밍이 잡힌 종목만 수집
            if score > 0:
                results.append({
                    "ticker": ticker,
                    "name": name,
                    "market": market_type,
                    "price": price,
                    "rate": rate,
                    "rsi": rsi,
                    "volume_ratio": volume_ratio,
                    "score": score,
                    "signals": detected_signals
                })

        # 신호 점수 및 수급(거래량 배수) 강도 순 정렬
        results.sort(key=lambda x: (x["score"], x["volume_ratio"]), reverse=True)

        output = {
            "update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S KST"),
            "data_date": todate,
            "market": "KOSPI+KOSDAQ",
            "total_scanned": len(df_today),
            "total_signals": len(results),
            "stocks": results
        }

        with open("data/signals.json", "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"✨ 분석 및 저장 완료! 감지된 국내 종목 수: {len(results)}개 / 총 스캔: {len(df_today)}개")

    except Exception as e:
        print(f"❌ 전종목 수집 및 신호 분석 중 치명적 에러 발생: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
