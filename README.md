# 국내주식 매수신호 스캐너 (무료 버전)

국내(KOSPI + KOSDAQ) 전체 상장종목을 매일 자동으로 스캔해서,
정배열 / RSI 과매도탈출 / MACD 골든크로스 / 거래량 급증 / 피보나치 지지
5가지 기술적 신호를 감지하고 웹 대시보드로 보여주는 100% 무료 프로젝트입니다.

- 데이터 소스: [pykrx](https://github.com/sharebook-kr/pykrx) (한국거래소 공개데이터 기반, API 키 불필요)
- 자동 실행: GitHub Actions (매일 장마감 후, 무료)
- 호스팅: GitHub Pages (무료)
- 별도 서버·DB 없음 (JSON 파일 한 개로 모든 데이터 관리)

---

## 1. 리포지토리에 올리기

이 폴더 전체를 본인 GitHub 리포지토리에 push 하세요.

```bash
git init
git add .
git commit -m "init: 국내주식 매수신호 스캐너"
git branch -M main
git remote add origin https://github.com/<본인계정>/<리포지토리명>.git
git push -u origin main
```

## 2. GitHub Pages 활성화

1. 리포지토리 → **Settings → Pages**
2. Source: `Deploy from a branch` 선택
3. Branch: `main` / `/ (root)` 선택 후 저장
4. 몇 분 후 `https://<계정>.github.io/<리포지토리명>/` 에서 접속 가능

## 3. GitHub Actions 권한 확인

1. 리포지토리 → **Settings → Actions → General**
2. "Workflow permissions" 항목에서 **Read and write permissions** 선택 후 저장
   (이게 꺼져 있으면 Actions가 signals.json을 커밋/푸시하지 못합니다)

## 4. 첫 실행 (수동으로 한 번 돌려보기)

기본적으로는 평일 KST 16:30에 자동 실행되지만, 바로 확인해보고 싶다면:

1. 리포지토리 → **Actions** 탭
2. 왼쪽에서 `Update Stock Signals` 워크플로 선택
3. **Run workflow** 버튼 클릭

> ⚠️ 전체 종목(약 2,500개)을 스캔하기 때문에 첫 실행에는 **30분~1시간 정도** 걸릴 수 있습니다.
> 완료되면 `data/signals.json`이 자동으로 갱신되고, 대시보드에도 바로 반영됩니다.

## 5. 로컬에서 테스트하고 싶다면

```bash
pip install -r requirements.txt
python update_stocks.py
```

실행 후 `data/signals.json`이 갱신되며, `index.html`을 브라우저로 직접 열어 확인할 수 있습니다.
(단, 로컬 파일을 `file://`로 열면 fetch가 막힐 수 있으니, 아래처럼 간단한 로컬 서버를 쓰는 걸 추천합니다.)

```bash
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

---

## 신호 계산 기준 (update_stocks.py)

| 신호 | 조건 |
|---|---|
| 정배열 | 5일 이동평균 > 20일 이동평균 > 60일 이동평균 |
| RSI과매도탈출 | RSI(14)가 전일 30 이하 → 당일 30 초과로 반등 |
| MACD골든크로스 | MACD선이 전일 대비 당일 시그널선을 상향 돌파 |
| 거래량급증 | 당일 거래량이 최근 20일 평균 거래량의 2배 이상 |
| 피보나치XX%지지 | ZigZag로 찾은 최근 스윙 구간의 피보나치 되돌림(23.6~78.6%) 레벨에 현재가가 ±2% 이내로 근접 |

숫자(임계값)는 `update_stocks.py` 상단의 설정값 부분에서 바로 조정할 수 있습니다.

## 커스터마이징 아이디어

- `MIN_SCORE_TO_INCLUDE`를 2 이상으로 올리면 더 신뢰도 높은 종목만 남길 수 있어요.
- 신호를 더 추가하고 싶다면 `analyze_ticker()` 함수 안에 조건을 하나 더 추가하면 됩니다.
- 종목 상세 페이지(차트 포함)를 원한다면 `stock.get_market_ohlcv()` 결과를 종목별 JSON으로도 저장해서 detail 페이지를 따로 만들 수 있어요.

## ⚠️ 투자 유의사항

이 도구는 과거 가격 데이터 기반의 기술적 지표 스크리닝 결과만 보여줍니다.
투자 조언이 아니며, 실적/뉴스/수급 등 다른 요인은 반영되지 않습니다. 매매 판단과 책임은 본인에게 있습니다.
