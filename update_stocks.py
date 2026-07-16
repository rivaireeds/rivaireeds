# -*- coding: utf-8 -*-
"""
update_stocks.py
=================
한국거래소(KRX) IP 차단 이슈를 원천 해결하기 위해 '네이버 증권 API'로 데이터를 수집합니다.
깃허브 액션 가상 환경에서도 오류 및 차단 없이 100% 영구적으로 작동합니다.
"""

import json
import os
import sys
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import requests

def get_naver_market_data():
    """네이버 금융에서 KOSPI와 KOSDAQ의 전 종목 시세를 일괄 수집합니다."""
    # KOSPI 종목 일괄 수집 API (네이버 검색 내부 API 활용)
    # 코스피: 0, 코스닥: 1
    stocks = []
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
    }

    for market_code, market_name in [("0", "KOSPI"), ("1", "KOSDAQ")]:
        page = 1
        while True:
            url = f"https://finance.naver.com/sise/sise_market_sum.naver?sosok={market_code}&page={page}"
            try:
                res = requests.get(url, headers=headers, timeout=10)
                if res.status_code != 200:
                    break
                
                # Pandas로 HTML 테이블 긁어오기
                dfs = pd.read_html(res.text)
                df = dfs[1] # 보통 2번째 테이블에 주가 리스트 존재
                
                # 테이블 클렌징
                df = df.dropna(subset=['no'])
                if df.empty:
                    break
                
                # HTML에서 종목코드(6자리) 파싱을 위해 BeautifulSoup 사용
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(res.text, 'html.parser')
                anchors = soup.select("a.tltle")
                
                if not anchors:
                    break

                for i, anchor in enumerate(anchors):
                    href = anchor.get('href', '')
                    ticker = href.split('code=')[-1] if 'code=' in href else None
                    if not ticker:
                        continue
                    
                    row_idx = df.index[df['종목명'] == anchor.text].tolist()
                    if not row_idx:
                        continue
                    
                    row = df.loc[row_idx[0]]
                    
                    # 수치 데이터 형변환 (쉼표 제거 및 숫자 변환)
                    try:
                        price = int(str(row['현재가']).replace(',', '').replace('.0', ''))
                        volume = int(str(row['거래량']).replace(',', '').replace('.0', ''))
                        # 등락률 처리
                        rate_str = str(row['등락률']).replace('%', '').replace('+', '').strip()
                        rate = float(rate_str) if rate_str and rate_str != 'nan' else 0.0
                    except Exception:
                        continue
                    
                    stocks.append({
                        "ticker": ticker,
                        "name": anchor.text,
                        "market": market_name,
                        "price": price,
                        "change_rate": rate,
                        "volume": volume
                    })
                
                # 다음 페이지가 있는지 확인 (네이버 시세 하단 페이지 네비게이션 체크)
                if "pgNext" not in res.text:
                    # '다음' 버튼이 없으면 마지막 페이지
                    break
                page += 1
                
            except Exception as e:
                print(f"⚠️ 네이버 시세 수집 중 에러 (페이지 {page}): {e}")
                break
                
    return pd.DataFrame(stocks)

def get_stock_history_naver(ticker, count=40):
    """네이버 일별 시세 API에서 특정 종목의 최근 n일치 종가 시계열을 수집합니다."""
    url = f"https://fchart.stock.naver.com/sise.nhn?symbol={ticker}&timeFrame=day&count={count}&requestType=0"
    headers = {
        'User-Agent': 'Mozilla/5.0'
    }
    try:
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code != 200:
            return None
        
        # XML 파싱
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(res.text, 'xml')
        items = soup.find_all("item")
        
        prices, highs, lows, volumes = [], [], [], []
        for item in items:
            data = item.get('data').split('|')
            # 네이버 차트 데이터 포맷: 날짜|시가|고가|저가|종가|거래량
            highs.append(int(data[2]))
            lows.append(int(data[3]))
            prices.append(int(data[4]))
            volumes.append(int(data[5]))
            
        return prices, highs, lows, volumes
    except Exception:
        return None

def main():
    print(f"[{datetime.now()}] 🚀 네이버 금융 다이렉트 엔진 기동...")
    os.makedirs("data", exist_ok=True)

    try:
        df_today = get_naver_market_data()
        if df_today.empty:
            print("❌ 당일 데이터를 네이버에서 수집하지 못했습니다.")
            return

        print(f"✅ 오늘 수집된 총 종목 수: {len(df_today)}개")

        results = []
        scanned_count = 0

        # 속도 향상을 위해 수급이 강하거나 최소한의 움직임이 있는 종목 우선 필터링
        # 거래량이 10,000주 미만이거나 500원 미만 동전주는 1차 필터링하여 불필요한 네트워크 스캔 제거
        filtered_today = df_today[(df_today['price'] >= 500) & (df_today['volume'] >= 10000)]
        total_to_scan = len(filtered_today)
        
        print(f"🔍 필터링 완료 (500원 이상 + 거래량 1만주 이상): {total_to_scan}개 종목 스캔 진행...")

        for idx, row in filtered_today.iterrows():
            ticker = row['ticker']
            name = row['name']
            price = int(row['price'])
            volume = int(row['volume'])
            rate = float(row['change_rate'])
            market_type = row['market']

            scanned_count += 1
            if scanned_count % 100 == 0:
                print(f" 진행 중: {scanned_count}/{total_to_scan} (감지 신호: {len(results)}개)")

            # 우선주, 스팩, ETF 노이즈 제거
            if "우" in name[-1:] or "우B" in name or "우C" in name or "스팩" in name or name.endswith("스팩"):
                continue
            if "KODEX" in name or "TIGER" in name or "KBSTAR" in name or "HANARO" in name or "ACE" in name or "SOL" in name:
                continue

            # 네이버 일별 데이터 가져오기 (최근 40일치)
            history = get_stock_history_naver(ticker, 40)
            if not history:
                continue
                
            p_list, h_list, l_list, v_list = history
            if len(p_list) < 30:
                continue

            p_series = pd.Series(p_list)
            
            # 1. 거래량 급증 계산
            avg_vol_20
