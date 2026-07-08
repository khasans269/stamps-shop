#!/usr/bin/env bash
# Приводит расширения файлов к нижнему регистру (photo.JPG -> photo.jpg).
# Зачем: серверы Vercel/Timeweb (Linux) различают регистр в именах файлов,
# а macOS — нет. Из-за этого путь /images/x.jpg к файлу x.JPG работает
# локально, но даёт 404 на боевом сайте. Скрипт убирает эту ловушку.
#
# Использование:
#   bash scripts/lowercase-ext.sh [папка]
# Без аргумента берётся public/images/individual.
#
# Меняется только расширение, само имя файла не трогается. Скрытые файлы
# (.DS_Store и т.п.) пропускаются. На case-insensitive ФС используется
# промежуточное переименование — иначе смена регистра «не видна».

set -euo pipefail

dir="${1:-public/images/individual}"

if [ ! -d "$dir" ]; then
  echo "Папки нет: $dir" >&2
  exit 1
fi

cd "$dir"

for f in *; do
  [ -f "$f" ] || continue
  case "$f" in .*) continue ;; esac          # пропускаем скрытые файлы
  ext="${f##*.}"
  [ "$ext" = "$f" ] && continue              # у файла нет расширения
  lc="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
  [ "$ext" = "$lc" ] && continue             # уже в нижнем регистре
  base="${f%.*}"
  target="${base}.${lc}"
  tmp="${base}.__lc_tmp__"
  mv -- "$f" "$tmp" && mv -- "$tmp" "$target"
  echo "$f -> $target"
done

echo "Готово."
