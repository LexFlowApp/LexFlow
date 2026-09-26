#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
app="$root/dist/forge/LexFlow-darwin-arm64/LexFlow.app"
target="${HOME}/Applications/LexFlow.app"
legacy_target="${HOME}/Applications/Flow.app"

if [ ! -d "$app" ]; then
  echo "未找到构建结果，请先运行打包脚本。" >&2
  exit 1
fi

mkdir -p "${HOME}/Applications"
backup_root="${HOME}/Library/Application Support/LexFlow/backups"
mkdir -p "$backup_root"

archive_app() {
  source_app="$1"
  archive_name="$2"
  archive_path="$backup_root/$archive_name"
  if [ ! -d "$source_app" ]; then
    return 0
  fi
  if [ -e "$archive_path" ]; then
    echo "备份目标已存在，停止安装以避免覆盖：$archive_path" >&2
    exit 1
  fi
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$source_app" "$archive_path"
  /usr/bin/unzip -tqq "$archive_path"
  echo "已生成可回滚备份：$archive_path"
}

prune_archives() {
  backup_prefix="$1"
  archives=( "$backup_root"/${backup_prefix}-*.zip )
  if [ ! -e "${archives[0]}" ]; then
    return 0
  fi
  sorted_archives=()
  while IFS= read -r archive; do
    sorted_archives+=("$archive")
  done < <(printf '%s\n' "${archives[@]}" | LC_ALL=C /usr/bin/sort -r)
  for ((index = 3; index < ${#sorted_archives[@]}; index += 1)); do
    if [ -f "${sorted_archives[$index]}" ]; then
      /bin/rm -f -- "${sorted_archives[$index]}"
      echo "已清理旧备份：${sorted_archives[$index]}"
    fi
  done
}

backup_timestamp="$(/bin/date +%Y%m%d-%H%M%S)"
if [ -d "$target" ]; then
  archive_app "$target" "LexFlow-backup-${backup_timestamp}.zip"
  /bin/rm -R -- "$target"
fi
if [ -d "$legacy_target" ]; then
  archive_app "$legacy_target" "Flow-backup-${backup_timestamp}.zip"
  /bin/rm -R -- "$legacy_target"
fi
/usr/bin/ditto "$app" "$target"
prune_archives 'LexFlow-backup'
prune_archives 'Flow-backup'
echo "LexFlow 已安装到：$target"
