#!/usr/bin/env sh
# docs-drift.sh — README와 docs/가 아직 "사실"인지 검사한다. 하나라도 어긋나면 exit 1.
#
# 목적: "README 고치는 걸 잊는다"는 사람 문제를,
#       "README가 코드보다 오래됐다"는 기계가 볼 수 있는 사실로 바꾼다.
# 실행: npm run check:docs   (또는 sh scripts/docs-drift.sh)

set -u
cd "$(dirname "$0")/.." || exit 2

fail=0
bad()  { printf '  \033[31mx\033[0m %s\n' "$1"; fail=1; }
good() { printf '  \033[32mv\033[0m %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

DOCS=$(ls README.md docs/*.md docs/adr/*.md 2>/dev/null)

# 1 ─ 자리표시자가 살아 있는가 (포트폴리오 첫 화면의 죽은 링크가 제일 비싸다)
head_ '1. 자리표시자'
hits=$(grep -nE 'REPLACE-ME|linkedin\.com/in/you\b|example\.com|\bTODO\b|\bTBD\b|<[A-Z][A-Z0-9_-]+>' $DOCS 2>/dev/null)
if [ -n "$hits" ]; then
  printf '%s\n' "$hits" | sed 's/^/      /'
  bad '자리표시자가 남아 있습니다'
else
  good '없음'
fi

# 2 ─ 상대 링크가 실제로 존재하는가 (파일별로 그 파일 기준에서 해석)
head_ '2. 상대 링크'
miss=''
for f in $DOCS; do
  dir=$(dirname "$f")
  for p in $(grep -ohE '\]\([^)]+\)' "$f" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//; s/#.*//' \
            | grep -vE '^(https?:|mailto:|tel:|$)' | sort -u); do
    [ -e "$dir/$p" ] || miss="$miss$f -> $p\n"
  done
done
if [ -n "$miss" ]; then printf "$miss" | sed 's/^/      /'; bad '끊긴 링크'; else good '모두 존재'; fi

# 3 ─ 언급한 ADR이 docs/adr/ 에 실재하는가
head_ '3. ADR 참조'
adrs=$(grep -rhoE 'ADR-[0-9]{3}' $DOCS 2>/dev/null | sort -u)
if [ -z "$adrs" ]; then good '참조 없음'; else
  allok=1
  for a in $adrs; do
    n=${a#ADR-}
    if ! ls docs/adr/"$n"-*.md >/dev/null 2>&1; then bad "없는 ADR 참조: $a"; allok=0; fi
  done
  [ "$allok" -eq 1 ] && good "$(printf '%s' "$adrs" | tr '\n' ' ')모두 존재"
fi

# 4 ─ Status의 Phase 번호가 1~8 연속인가 (번호 재배치 사고 방지)
head_ '4. Status 번호'
nums=$(grep -oE '\[[ x]\] [0-9]+' README.md 2>/dev/null | grep -oE '[0-9]+$' | tr '\n' ' ')
if [ "$nums" = '1 2 3 4 5 6 7 8 ' ]; then good '1~8 연속'; else bad "1~8 연속이 아님: [$nums]"; fi

# 5 ─ 존재하지 않는 Phase를 가리키는가 (워크북의 10.8b 버그와 같은 종류)
head_ '5. Phase 참조'
over=$(grep -ohE 'Phase [0-9]+' $DOCS 2>/dev/null | grep -oE '[0-9]+' | sort -un | awk '$1>8')
if [ -n "$over" ]; then
  for n in $over; do bad "존재하지 않는 Phase 참조: Phase $n (세로축은 1~8)"; done
else good '모두 1~8 안'; fi

# 6 ─ README가 코드보다 오래됐는가  ← 이 검사가 이 스크립트의 존재 이유
head_ '6. README vs 코드'
rsha=$(git log -1 --format=%H -- README.md 2>/dev/null)
if [ -z "$rsha" ]; then good '(git 이력 없음 — 건너뜀)'; else
  behind=$(git log --oneline --no-merges "${rsha}..HEAD" -- ios api infra web 2>/dev/null)
  if [ -n "$behind" ]; then
    rdate=$(git log -1 --format=%cs -- README.md)
    n=$(printf '%s\n' "$behind" | wc -l | tr -d ' ')
    bad "README($rdate) 이후 코드 커밋 ${n}개 — 넷 중 무엇이 달라졌는지 확인: Live / Architecture / Next / Status"
    printf '%s\n' "$behind" | head -8 | sed 's/^/      /'
    [ "$n" -gt 8 ] && printf '      ... 그리고 %s개 더 (git log %s..HEAD -- ios api infra web)\n' "$((n-8))" "$(git rev-parse --short "$rsha")"
  else good '코드보다 뒤처지지 않음'; fi
fi

printf '\n'
[ "$fail" -eq 0 ] && printf '\033[32mdocs ok\033[0m\n' || printf '\033[31mdocs drift — 위 항목을 고치세요\033[0m\n'
exit "$fail"
