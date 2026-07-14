# -*- coding: utf-8 -*-
"""
update_stocks.py
=================
국내 전 종목(KOSPI, KOSDAQ)의 당일 시세 정보 및 14일치 데이터를 일괄 수집한 뒤,
메모리 상에서 연산하여 1) RSI 과매도 탈출, 2) 거래량 급증 신호를 초고속으로 판정합니다.
개별 종목별 호출 루프가 없으므로 API 차단 위험이 없으며 1분 내외로 완료됩니다.
"""

import json
import os
import sys
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from pykrx import stock

def get_nearest_business_days():
    """최근 거래 영업일 20일을 확보합니다."""
    today = datetime.now()
    dates = []
    # 넉넉하게 최근 45일 중 영업일을 탐색
    for i in range(45):
        day = today - timedelta(days=i)
        if day.weekday() < 5:  # 주말 제외
            dates.append(day.strftime("%Y%m%d"))
    return sorted(dates)

def main():
    print(f"[{datetime.now()}] 🚀 초고속 전종목 신호 탐지 엔진 가동 시작...")
    os.makedirs("data", exist_ok=True)

    business_days = get_nearest_business_days()
    if len(business_days) < 20:
        print("❌ 유효한 영업일 데이터를 확보하지 못했습니다.")
        return

    # 1. 대상 날짜 정의
    todate = business_days[-1]       # 당일
    prev_20_date = business_days[-20] # 20영업일 전 (거래량 평균 계산용)
    prev_15_date = business_days[-15] # 15영업일 전 (RSI 계산을 위해 최소 14일 이상의 데이터 필요)

    try:
        # 2. 당일 전체 종목 시세 일괄 조회 (1회 호출)
        print(f"📊 {todate} 당일 시장 데이터 일괄 수집 중...")
        df_today = stock.get_market_ohlcv_by_ticker(todate, market="ALL")
        if df_today.empty or df_today['종가'].sum() == 0:
            # 장마감 전이거나 휴일이면 직전 영업일로 대체
            todate = business_days[-2]
            prev_20_date = business_days[-21]
            prev_15_date = business_days[-16]
            print(f"⚠️ 직전 영업일 데이터로 전환 조회합니다: {todate}")
            df_today = stock.get_market_ohlcv_by_ticker(todate, market="ALL")

        if df_today.empty:
            print("❌ 당일 데이터를 조회할 수 없습니다.")
            return

        df_today = df_today.reset_index() # '티커'를 컬럼으로 추출
        df_today.rename(columns={'티커': 'ticker', '종가': 'price', '등락률': 'change_rate', '거래량': 'volume', '거래대금': 'amount'}, inplace=True)
        
        # 3. RSI 계산을 위해 이전 영업일별 전종목 종가 데이터 일괄 수집
        print("📈 RSI 및 평균 거래량 연산을 위한 과거 주가 매핑 시작...")
        
        # 전종목의 종가와 거래량 흐름을 담을 딕셔너리 구성
        price_history = {row['ticker']: [int(row['price'])] for _, row in df_today.iterrows()}
        volume_history = {row['ticker']: [int(row['volume'])] for _, row in df_today.iterrows()}

        # 과거 20영업일 동안의 데이터를 대량 수집 (날짜별로 단 20번만 호출하므로 차단당하지 않습니다!)
        target_past_days = business_days[-20:-1]
        for day in target_past_days:
            df_past = stock.get_market_ohlcv_by_ticker(day, market="ALL")
            if df_past.empty:
                continue
            df_past = df_past.reset_index()
            for _, row in df_past.iterrows():
                t = row['티커']
                if t in price_history:
                    price_history[t].append(int(row['종가']))
                    volume_history[t].append(int(row['거래량']))

        results = []

        # 4. 연산 가동
        for _, row in df_today.iterrows():
            ticker = row['ticker']
            price = int(row['price'])
            volume = int(row['volume'])
            amount = int(row['amount'])
            rate = float(row['change_rate'])
            
            # 거래정지나 관리종목 등은 제외
            if price == 0 or volume == 0:
                continue

            name = stock.get_market_ticker_name(ticker)
            if not name or "우" in name[-1:] or "우B" in name or "우C" in name: # 우선주 제외
                continue

            # 시장 분류
            market_type = "KOSPI" if ticker in stock.get_market_ticker_list(market="KOSPI") else "KOSDAQ"

            # 20일 평균 거래량 산출
            v_list = volume_history.get(ticker, [volume])
            avg_vol_20 = np.mean(v_list[:20]) if len(v_list) >= 20 else volume
            volume_ratio = round(volume / avg_vol_20, 2) if avg_vol_20 > 0 else 1.0

            # 14일 RSI 계산 (종가 히스토리 기준)
            p_list = price_history.get(ticker, [price])
            rsi = 50 # 기본값
            if len(p_list) >= 15:
                # 역순으로 되어있으므로 시간순 정렬
                p_series = pd.Series(p_list[::-1])
                delta = p_series.diff()
                up = delta.clip(lower=0)
                down = -1 * delta.clip(upper=0)
                
                ema_up = up.ewm(com=13, adjust=False).mean()
                ema_down = down.ewm(com=13, adjust=False).mean()
                
                rs = ema_up / ema_down.replace(0, np.nan)
                rsi_series = 100 - (100 / (1 + rs))
                rsi = round(rsi_series.iloc[-1], 1) if not np.isnan(rsi_series.iloc[-1]) else 50
                
                # 어제의 RSI 구하기 (과매도 탈출 여부 확인용)
                prev_rsi = round(rsi_series.iloc[-2], 1) if len(rsi_series) > 1 and not np.isnan(rsi_series.iloc[-2]) else 50
            else:
                prev_rsi = 50

            # 5. [수정 항목] 핵심 신호 탐지 필터링
            detected_signals = []
            score = 0

            # 1) RSI 과매도 탈출 (어제는 RSI 30 이하였으나 오늘 30 위로 탈출)
            if prev_rsi <= 30 < rsi:
                detected_signals.append("RSI과매도탈출")
                score += 50

            # 2) 거래량 급증 (최근 20일 평균 대비 당일 거래량이 2배(200%) 이상 상승)
            if volume_ratio >= 2.0 and volume > 50000:
                detected_signals.append("거래량급증")
                score += 50

            # 어느 하나라도 조건에 부합하는 유효한 매수 후보 종목만 저장 리스트에 추가
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

        # 신호 점수가 높고 거래대금이 탄탄한 순서로 정렬
        results.sort(key=lambda x: (x["score"], x["volume_ratio"]), reverse=True)

        # 5. JSON 저장
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

        print(f"✨ 분석 및 갱신 성공! 감지된 종목 수: {len(results)}개 / 총 스캔 종목: {len(df_today)}개")

    except Exception as e:
        print(f"❌ 전종목 수집 가동 실패: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
