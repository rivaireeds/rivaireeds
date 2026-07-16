# -*- coding: utf-8 -*-
"""
update_stocks.py  (v2 — GitHub 캐시 기반, KRX 직접 접속 없음)
================================================================
[이전 버전과의 가장 큰 차이점]
이전 버전은 pykrx로 KRX 서버에 종목당 1번씩(약 2,500번) 직접 접속했다.
그런데 GitHub Actions 서버(해외 IP)에서 KRX가 요청을 계속 빈 응답으로 막아서 실패했다.

이번 버전은 KRX에 전혀 접속하지 않는다. 대신 FinanceDataReader 프로젝트가
매일 자동으로 KRX 전종목 시세를 캐싱해서 올려주는 공개 GitHub 저장소
(FinanceData/fdr_krx_data_cache)에서 날짜별 CSV를 그대로 받아온다.
GitHub -> GitHub 요청이라 GitHub Actions 환경에서 막힐 걱정이 없고,
하루치 파일 하나에 전종목이 다 들어있어서 종목별로 개별 요청할 필요도 없다
(약 2,500번 요청 -> 약 130번 요청으로 감소, 실행 시간도 크게 단축).

전체 흐름
---------
1. 최근 LOOKBACK_DAYS 만큼의 날짜별 스냅샷 CSV를 GitHub에서 받아온다.
2. 주말/공휴일에는 직전 거래일 데이터가 그대로 이월되어 있으므로, 연속된
   날짜의 종가/거래량이 완전히 동일하면 "새 거래일이 아니다"로 보고 제거한다.
3. 종목(Code)별로 시계열을 만들어 기술적 신호 5가지를 계산한다.
4. 신호가 1개 이상 감지된 종목만 data/signals.json에 저장한다.
5. 그 종목들은 상세 차트 페이지에서 쓸 수 있도록 최근 시세 이력을
   data/history/{티커}.json 으로 별도 저장한다.
"""

import io
import json
import os
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import requests

# ----------------------------------------------------------------------------
# 설정값
# ----------------------------------------------------------------------------
CACHE_BASE_URL = "https://raw.githubusercontent.com/FinanceData/fdr_krx_data_cache/refs/heads/master/data/listing/krx"

LOOKBACK_DAYS = 130          # 과거 몇 "달력일"치를 가져올지 (캐시 저장소 시작 시점보다 적게 잡아야 함)
VOLUME_SURGE_RATIO = 2.0     # 거래량 급증 판단 배수
ZIGZAG_THRESHOLD = 0.08      # ZigZag 스윙 판정 임계값
FIB_TOLERANCE = 0.02         # 피보나치 레벨 근접 판단 비율
MIN_SCORE_TO_INCLUDE = 2     # 이 점수 이상인 종목만 결과에 포함 (1이면 너무 많아서 노이즈가 큼)
HISTORY_DAYS_TO_SAVE = 90    # 상세 차트용으로 저장할 최근 거래일 수
REQUEST_TIMEOUT = 15


def fetch_daily_snapshot(date_obj):
    """
    특정 날짜(datetime)의 전종목 시세 캐시 CSV를 받아온다.
    해당 날짜 파일이 없으면(캐시 저장소 시작 이전 등) None을 반환한다.
    """
    date_str = date_obj.strftime("%Y-%m-%d")
    url = f"{CACHE_BASE_URL}/{date_str}.csv"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        df = pd.read_csv(io.StringIO(resp.text), index_col=0, dtype={"Code": str})
        df["Date"] = date_str
        return df[["Date", "Code", "Name", "Market", "Open", "High", "Low", "Close", "Volume"]]
    except Exception as e:
        print(f"  [경고] {date_str} 스냅샷 로드 실패: {e}", file=sys.stderr)
        return None


def build_panel():
    """
    최근 LOOKBACK_DAYS 만큼의 날짜별 스냅샷을 모두 받아서 하나의 DataFrame으로 합친다.
    그다음 주말/공휴일 이월 데이터(직전 거래일과 완전히 동일한 행)를 제거한다.
    """
    today = datetime.today()
    frames = []

    for days_back in range(LOOKBACK_DAYS):
        date_obj = today - timedelta(days=days_back)
        df = fetch_daily_snapshot(date_obj)
        if df is not None:
            frames.append(df)

        if (days_back + 1) % 20 == 0:
            print(f"[{datetime.now()}] 스냅샷 수집 진행: {days_back + 1}/{LOOKBACK_DAYS}일")

    if not frames:
        raise RuntimeError("스냅샷을 하나도 받아오지 못했습니다. GitHub 캐시 저장소 상태를 확인해주세요.")

    panel = pd.concat(frames, ignore_index=True)
    panel = panel[panel["Market"].isin(["KOSPI", "KOSDAQ"])].copy()
    panel = panel.sort_values(["Code", "Date"]).reset_index(drop=True)

    # 주말/공휴일 이월 제거: 직전 날짜와 종가/거래량이 완전히 같으면 "새 거래가 없었다"고 보고 삭제
    is_duplicate = (
        panel.groupby("Code")[["Close", "Volume"]].shift() == panel[["Close", "Volume"]]
    ).all(axis=1)
    panel = panel[~is_duplicate].reset_index(drop=True)

    print(f"[{datetime.now()}] 패널 데이터 구성 완료: 종목 {panel['Code'].nunique()}개, "
          f"총 {len(panel)}행 (중복 이월 제거 후)")
    return panel


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
    종가 시리즈에서 ZigZag 피벗(스윙 고점/저점)을 추출한다.
    반환값: [(index_position, price, 'high' or 'low'), ...] 리스트 (시간순)
    """
    prices = close.values
    n = len(prices)
    if n < 5:
        return []

    pivots = []
    trend = None
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

    if trend is not None:
        pivots.append((last_pivot_idx, last_pivot_price, "high" if trend == "up" else "low"))

    return pivots


def fibonacci_levels(low: float, high: float) -> dict:
    diff = high - low
    return {
        "23.6%": high - diff * 0.236,
        "38.2%": high - diff * 0.382,
        "50.0%": high - diff * 0.5,
        "61.8%": high - diff * 0.618,
        "78.6%": high - diff * 0.786,
    }


def check_fibonacci_support(close: pd.Series):
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


# 파동위치·매수타점 계산 기준 (프론트에도 그대로 노출해서 사용자가 근거를 알 수 있게 함)
WAVE_BASIS_NOTE = (
    "일봉(종가) 기준 · ZigZag 8% 스윙 전환점으로 구간을 나눈 단순화된 파동 카운트입니다. "
    "정통 엘리어트파동 이론의 세부 규칙(파동 간 피보나치 비율, 3파 최단파동 금지 등)까지 "
    "전부 검증한 것은 아니며, 참고용 스윙 위치 표시로만 활용해주세요."
)


def analyze_wave_and_levels(close: pd.Series):
    """
    ZigZag 피벗을 기반으로 (1) 지금이 몇 번째 스윙(파동)인지,
    (2) 상승파동이 어디까지 진행됐는지, (3) 매수타점/목표가/손절가를 계산한다.

    - 매수타점: 현재 상승 구간의 38.2% 되돌림 지점 (조정 시 매수 관점)
    - 목표가: 직전 하락폭 대비 1.272배 확장 지점 (일반적인 파동 확장 비율)
    - 손절가: 이번 상승의 시작점(직전 스윙 저점) 대비 2% 아래 (그 아래로 깨지면 상승 근거 무효화로 판단)
    """
    pivots = zigzag_pivots(close)
    if len(pivots) < 3:
        return None

    prev_swing, last_swing, current = pivots[-3], pivots[-2], pivots[-1]
    wave_count = len(pivots) - 1  # 확정된 스윙 개수 (진행중인 마지막 구간 제외)
    wave_number = ((wave_count - 1) % 5) + 1  # 5파 주기로 순환 라벨링 (단순화)
    direction = "상승" if current[2] == "high" else "하락"
    current_price = float(close.iloc[-1])

    prior_leg_size = abs(last_swing[1] - prev_swing[1])
    progress_pct = None
    if prior_leg_size > 0:
        progress_pct = round(abs(current_price - last_swing[1]) / prior_leg_size * 100, 1)

    result = {
        "wave_direction": direction,
        "wave_number": wave_number,
        "wave_progress_pct": progress_pct,
        "buy_point": None,
        "target_price": None,
        "stop_loss": None,
    }

    if direction == "상승":
        swing_low = last_swing[1]
        result["buy_point"] = int(current_price - (current_price - swing_low) * 0.382)
        result["target_price"] = int(swing_low + prior_leg_size * 1.272)
        result["stop_loss"] = int(swing_low * 0.98)
    else:
        # 하락 파동이 진행 중일 때는 신규 매수 구간이 아니므로 손절가(참고용)만 제시
        result["stop_loss"] = int(current_price * 0.95)

    return result


def analyze_stock(group: pd.DataFrame):
    """
    종목 하나의 시계열(Date순 정렬된 DataFrame)을 받아서 신호 리스트와 부가정보를 계산한다.
    데이터가 부족하면 None 반환.
    """
    if len(group) < 65:  # MA60 계산에 최소 65개 거래일 필요
        return None

    close = group["Close"].reset_index(drop=True)
    volume = group["Volume"].reset_index(drop=True)

    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()
    ma60 = close.rolling(60).mean()

    rsi = calc_rsi(close)
    macd_line, signal_line = calc_macd(close)

    signals = []

    if ma5.iloc[-1] > ma20.iloc[-1] > ma60.iloc[-1]:
        signals.append("정배열")

    if pd.notna(rsi.iloc[-2]) and pd.notna(rsi.iloc[-1]):
        if rsi.iloc[-2] <= 30 and rsi.iloc[-1] > 30:
            signals.append("RSI과매도탈출")

    if (macd_line.iloc[-2] < signal_line.iloc[-2]) and (macd_line.iloc[-1] > signal_line.iloc[-1]):
        signals.append("MACD골든크로스")

    avg_volume_20 = volume.iloc[-21:-1].mean()
    if avg_volume_20 > 0 and volume.iloc[-1] >= avg_volume_20 * VOLUME_SURGE_RATIO:
        signals.append("거래량급증")

    fib_hit = check_fibonacci_support(close)
    if fib_hit:
        signals.append(f"피보나치{fib_hit}지지")

    if not signals:
        return {"signals": [], "score": 0}

    prev_close = close.iloc[-2]
    change_rate = ((close.iloc[-1] - prev_close) / prev_close * 100) if prev_close else None

    wave_info = analyze_wave_and_levels(close) or {}

    return {
        "signals": signals,
        "score": len(signals),
        "price": int(close.iloc[-1]),
        "change_rate": round(float(change_rate), 2) if change_rate is not None else None,
        "volume": int(volume.iloc[-1]),
        "volume_ratio": round(float(volume.iloc[-1] / avg_volume_20), 2) if avg_volume_20 > 0 else None,
        "rsi": round(float(rsi.iloc[-1]), 1) if pd.notna(rsi.iloc[-1]) else None,
        "wave_direction": wave_info.get("wave_direction"),
        "wave_number": wave_info.get("wave_number"),
        "wave_progress_pct": wave_info.get("wave_progress_pct"),
        "buy_point": wave_info.get("buy_point"),
        "target_price": wave_info.get("target_price"),
        "stop_loss": wave_info.get("stop_loss"),
        "ma5": ma5, "ma20": ma20, "ma60": ma60,  # 상세페이지 차트용 (JSON 저장 전에 제거됨)
    }


def save_history_json(ticker: str, name: str, group: pd.DataFrame, ma5, ma20, ma60):
    """상세 차트 페이지용 최근 시세 이력을 data/history/{ticker}.json 으로 저장한다."""
    tail = group.tail(HISTORY_DAYS_TO_SAVE).reset_index(drop=True)
    n = len(tail)

    history = {
        "ticker": ticker,
        "name": name,
        "dates": tail["Date"].tolist(),
        "open": tail["Open"].astype(int).tolist(),
        "high": tail["High"].astype(int).tolist(),
        "low": tail["Low"].astype(int).tolist(),
        "close": tail["Close"].astype(int).tolist(),
        "volume": tail["Volume"].astype(int).tolist(),
        "ma5": [None if pd.isna(v) else round(float(v), 1) for v in ma5.tail(n)],
        "ma20": [None if pd.isna(v) else round(float(v), 1) for v in ma20.tail(n)],
        "ma60": [None if pd.isna(v) else round(float(v), 1) for v in ma60.tail(n)],
    }

    os.makedirs("data/history", exist_ok=True)
    with open(f"data/history/{ticker}.json", "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False)


def clean_history_dir():
    """
    이전 실행에서 만들어진 history JSON을 전부 지운다.
    (오늘 신호가 없는 종목의 차트 데이터가 저장소에 계속 남아 쌓이는 것을 방지)
    """
    history_dir = "data/history"
    if os.path.isdir(history_dir):
        for fname in os.listdir(history_dir):
            if fname.endswith(".json"):
                os.remove(os.path.join(history_dir, fname))


def main():
    panel = build_panel()
    clean_history_dir()

    results = []

    for code, group in panel.groupby("Code"):
        group = group.sort_values("Date").reset_index(drop=True)
        name = group["Name"].iloc[-1]
        market = group["Market"].iloc[-1]

        analysis = analyze_stock(group)
        if not analysis or analysis["score"] < MIN_SCORE_TO_INCLUDE:
            continue

        ma5, ma20, ma60 = analysis.pop("ma5"), analysis.pop("ma20"), analysis.pop("ma60")

        results.append({
            "ticker": code,
            "name": name,
            "market": market,
            **analysis,
        })

        save_history_json(code, name, group, ma5, ma20, ma60)

    results.sort(key=lambda x: x["score"], reverse=True)

    output = {
        "update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "market": "KOSPI+KOSDAQ",
        "total_scanned": int(panel["Code"].nunique()),
        "total_signals": len(results),
        "wave_basis_note": WAVE_BASIS_NOTE,
        "stocks": results,
    }

    os.makedirs("data", exist_ok=True)
    with open("data/signals.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[{datetime.now()}] 완료: 전체 {panel['Code'].nunique()}종목 중 {len(results)}종목에서 신호 발견")


if __name__ == "__main__":
    main()
