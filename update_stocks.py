# -*- coding: utf-8 -*-
"""
update_stocks.py
=================
국내(KOSPI + KOSDAQ) 전체 상장종목을 대상으로 매일 자동으로
기술적 매수신호를 계산해서 data/signals.json 으로 저장하는 배치 스크립트.

무료 데이터 소스인 pykrx(한국거래소 공개 데이터 기반)를 사용하며,
API 키가 필요 없다. GitHub Actions에서 하루 1회(장 마감 후) 자동 실행되는 것을 전제로 짰다.

계산하는 신호 5가지
--------------------
1. 정배열       : 5일선 > 20일선 > 60일선
2. RSI 과매도탈출 : RSI(14)가 30 아래에 있다가 다시 30 위로 올라오는 순간
3. MACD 골든크로스 : MACD선이 시그널선을 상향 돌파하는 순간
4. 거래량 급증    : 오늘 거래량이 최근 20일 평균 거래량의 2배 이상
5. 피보나치 지지  : ZigZag로 잡은 최근 스윙 구간의 피보나치 되돌림(38.2/50/61.8%) 근처에 현재가가 위치

각 종목마다 위 신호 중 몇 개가 동시에 뜨는지 세어서 "score"로 저장하고,
score가 0인(아무 신호도 없는) 종목은 결과 JSON에서 제외한다 (파일 용량 절약 + 실제로 쓸모있는 후보만 보기 위함).
"""

import json
import time
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from pykrx import stock

# ----------------------------------------------------------------------------
# 설정값 (필요하면 여기 숫자만 바꾸면 됨)
# ----------------------------------------------------------------------------
LOOKBACK_DAYS = 150          # 과거 몇 "달력일"치를 가져올지 (MA60 계산에 필요한 여유분 포함)
VOLUME_SURGE_RATIO = 2.0     # 거래량 급증 판단 배수
ZIGZAG_THRESHOLD = 0.08      # ZigZag 스윙 판정 임계값 (8% 이상 움직여야 새로운 피벗으로 인정)
FIB_TOLERANCE = 0.02         # 피보나치 레벨과 현재가가 이 비율(2%) 이내면 "근접"으로 판단
REQUEST_SLEEP = 0.25         # 종목별 요청 사이 대기시간 (초) - KRX 서버에 과도한 부하를 주지 않기 위함
MIN_SCORE_TO_INCLUDE = 1     # 이 점수 이상인 종목만 결과에 포함


def get_target_dates():
    """오늘 날짜 기준 과거 LOOKBACK_DAYS 만큼의 시작일/종료일(YYYYMMDD 문자열)을 반환한다."""
    today = datetime.today()
    fromdate = (today - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%d")
    todate = today.strftime("%Y%m%d")
    return fromdate, todate


def call_with_retry(func, *args, max_retries=4, delay=3, **kwargs):
    """
    KRX 서버가 일시적으로 빈 응답/오류를 줄 때가 있어서, 실패하면 잠깐 쉬었다가
    최대 max_retries번까지 같은 요청을 다시 시도하는 공용 래퍼.
    """
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_err = e
            print(f"  [재시도 {attempt}/{max_retries}] {func.__name__} 실패: {e}", file=sys.stderr)
            time.sleep(delay)
    raise last_err


def get_all_tickers():
    """
    KOSPI + KOSDAQ 전체 종목 코드 리스트를 반환한다.
    날짜를 지정하지 않고 호출하면 pykrx 내부에서 '최근 영업일'을 알아내는
    별도의 서버 요청을 추가로 보내는데, 이 요청이 가끔 빈 응답으로 실패한다.
    그래서 오늘 날짜부터 최대 7일 전까지 하루씩 뒤로 가며 날짜를 직접 지정해서
    시도하고, 그래도 실패하면 call_with_retry로 재시도한다.
    """
    today = datetime.today()

    for days_back in range(7):
        date_str = (today - timedelta(days=days_back)).strftime("%Y%m%d")
        try:
            kospi = call_with_retry(stock.get_market_ticker_list, date_str, market="KOSPI")
            kosdaq = call_with_retry(stock.get_market_ticker_list, date_str, market="KOSDAQ")
            if kospi and kosdaq:
                print(f"[{datetime.now()}] 종목 리스트 기준일: {date_str} "
                      f"(KOSPI {len(kospi)}개, KOSDAQ {len(kosdaq)}개)")
                return [(t, "KOSPI") for t in kospi] + [(t, "KOSDAQ") for t in kosdaq]
        except Exception as e:
            print(f"  [{date_str} 시도 실패] {e}", file=sys.stderr)

    raise RuntimeError("최근 7일 이내로 종목 리스트를 하나도 가져오지 못했습니다 (KRX 서버 문제 가능성)")


def calc_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """일반적인 RSI(Wilder 방식) 계산."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calc_macd(close: pd.Series, fast=12, slow=26, signal=9):
    """MACD선, 시그널선을 계산해서 (macd, signal_line) 튜플로 반환."""
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line


def zigzag_pivots(close: pd.Series, threshold=ZIGZAG_THRESHOLD):
    """
    가격의 종가 시리즈에서 ZigZag 피벗(스윙 고점/저점)을 추출한다.
    threshold(예: 0.08) 이상 반대방향으로 움직여야 새로운 피벗으로 인정한다.
    반환값: [(index_position, price, 'high' or 'low'), ...] 리스트 (시간순)
    """
    prices = close.values
    n = len(prices)
    if n < 5:
        return []

    pivots = []
    trend = None  # 'up' or 'down'
    last_pivot_idx = 0
    last_pivot_price = prices[0]

    for i in range(1, n):
        change = (prices[i] - last_pivot_price) / last_pivot_price

        if trend is None:
            if change >= threshold:
                trend = "up"
                last_pivot_price = prices[i]
                last_pivot_idx = i
            elif change <= -threshold:
                trend = "down"
                last_pivot_price = prices[i]
                last_pivot_idx = i
        elif trend == "up":
            if prices[i] >= last_pivot_price:
                last_pivot_price = prices[i]
                last_pivot_idx = i
            elif (prices[i] - last_pivot_price) / last_pivot_price <= -threshold:
                pivots.append((last_pivot_idx, last_pivot_price, "high"))
                trend = "down"
                last_pivot_price = prices[i]
                last_pivot_idx = i
        elif trend == "down":
            if prices[i] <= last_pivot_price:
                last_pivot_price = prices[i]
                last_pivot_idx = i
            elif (prices[i] - last_pivot_price) / last_pivot_price >= threshold:
                pivots.append((last_pivot_idx, last_pivot_price, "low"))
                trend = "up"
                last_pivot_price = prices[i]
                last_pivot_idx = i

    # 마지막 진행중인 피벗도 추가 (아직 반전되지 않았어도 "현재까지의 극점"으로 기록)
    if trend is not None:
        pivots.append((last_pivot_idx, last_pivot_price, "high" if trend == "up" else "low"))

    return pivots


def fibonacci_levels(low: float, high: float) -> dict:
    """스윙 저점/고점 사이의 피보나치 되돌림 레벨을 계산한다."""
    diff = high - low
    return {
        "23.6%": high - diff * 0.236,
        "38.2%": high - diff * 0.382,
        "50.0%": high - diff * 0.5,
        "61.8%": high - diff * 0.618,
        "78.6%": high - diff * 0.786,
    }


def check_fibonacci_support(close: pd.Series):
    """
    최근 ZigZag 피벗 2개(직전 스윙)를 기준으로 피보나치 레벨을 구하고,
    현재가가 그 중 하나에 근접해 있는지 확인한다.
    반환값: (해당하면 레벨 이름 문자열, 아니면 None)
    """
    pivots = zigzag_pivots(close)
    if len(pivots) < 2:
        return None

    (_, price_a, type_a), (_, price_b, type_b) = pivots[-2], pivots[-1]

    if type_a == type_b:
        return None

    low = min(price_a, price_b)
    high = max(price_a, price_b)
    if high == low:
        return None

    levels = fibonacci_levels(low, high)
    current_price = close.iloc[-1]

    for level_name, level_price in levels.items():
        if level_price == 0:
            continue
        if abs(current_price - level_price) / level_price <= FIB_TOLERANCE:
            return level_name

    return None


def analyze_ticker(ticker: str, df: pd.DataFrame):
    """
    종목 하나의 OHLCV DataFrame(pykrx 컬럼: 시가/고가/저가/종가/거래량)을 받아서
    신호 리스트와 부가정보를 계산해 dict로 반환한다. 데이터가 부족하면 None 반환.
    """
    if df is None or len(df) < 65:  # MA60 계산에 최소 65개 거래일 필요
        return None

    close = df["종가"]
    volume = df["거래량"]

    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()
    ma60 = close.rolling(60).mean()

    rsi = calc_rsi(close)
    macd_line, signal_line = calc_macd(close)

    signals = []

    # 1) 정배열
    if ma5.iloc[-1] > ma20.iloc[-1] > ma60.iloc[-1]:
        signals.append("정배열")

    # 2) RSI 과매도탈출 (전일 30 이하 -> 오늘 30 초과)
    if pd.notna(rsi.iloc[-2]) and pd.notna(rsi.iloc[-1]):
        if rsi.iloc[-2] <= 30 and rsi.iloc[-1] > 30:
            signals.append("RSI과매도탈출")

    # 3) MACD 골든크로스 (전일 macd < signal -> 오늘 macd > signal)
    if (macd_line.iloc[-2] < signal_line.iloc[-2]) and (macd_line.iloc[-1] > signal_line.iloc[-1]):
        signals.append("MACD골든크로스")

    # 4) 거래량 급증 (최근 20일 평균 대비, 오늘 제외)
    avg_volume_20 = volume.iloc[-21:-1].mean()
    if avg_volume_20 > 0 and volume.iloc[-1] >= avg_volume_20 * VOLUME_SURGE_RATIO:
        signals.append("거래량급증")

    # 5) 피보나치 지지 근접
    fib_hit = check_fibonacci_support(close)
    if fib_hit:
        signals.append(f"피보나치{fib_hit}지지")

    if not signals:
        return {"signals": [], "score": 0}

    change_rate = df["등락률"].iloc[-1] if "등락률" in df.columns else None

    return {
        "signals": signals,
        "score": len(signals),
        "price": int(close.iloc[-1]),
        "change_rate": round(float(change_rate), 2) if change_rate is not None else None,
        "volume": int(volume.iloc[-1]),
        "volume_ratio": round(float(volume.iloc[-1] / avg_volume_20), 2) if avg_volume_20 > 0 else None,
        "rsi": round(float(rsi.iloc[-1]), 1) if pd.notna(rsi.iloc[-1]) else None,
    }


def main():
    fromdate, todate = get_target_dates()
    print(f"[{datetime.now()}] 데이터 수집 기간: {fromdate} ~ {todate}")

    tickers = get_all_tickers()
    print(f"[{datetime.now()}] 전체 대상 종목 수: {len(tickers)}개")

    results = []
    fail_count = 0

    for i, (ticker, market) in enumerate(tickers):
        try:
            df = call_with_retry(
                stock.get_market_ohlcv, fromdate, todate, ticker,
                max_retries=2, delay=2,
            )
            if df is None or df.empty:
                continue

            name = stock.get_market_ticker_name(ticker)
            analysis = analyze_ticker(ticker, df)

            if analysis and analysis["score"] >= MIN_SCORE_TO_INCLUDE:
                results.append({
                    "ticker": ticker,
                    "name": name,
                    "market": market,
                    **{k: v for k, v in analysis.items() if k not in ("score",)},
                    "score": analysis["score"],
                })

        except Exception as e:
            fail_count += 1
            print(f"  [경고] {ticker} 처리 중 오류: {e}", file=sys.stderr)

        if (i + 1) % 100 == 0:
            print(f"[{datetime.now()}] 진행상황: {i + 1}/{len(tickers)} "
                  f"(신호 발견: {len(results)}개, 실패: {fail_count}개)")

        time.sleep(REQUEST_SLEEP)

    # score 높은 순으로 정렬
    results.sort(key=lambda x: x["score"], reverse=True)

    output = {
        "update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "data_date": todate,
        "market": "KOSPI+KOSDAQ",
        "total_scanned": len(tickers),
        "total_signals": len(results),
        "stocks": results,
    }

    with open("data/signals.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[{datetime.now()}] 완료: 전체 {len(tickers)}종목 중 {len(results)}종목에서 신호 발견 "
          f"(처리 실패 {fail_count}건)")


if __name__ == "__main__":
    main()
