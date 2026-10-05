#!/bin/sh
# Per-step backups for NO-COMMIT mode (see docs/refactor/REFACTOR_GUIDE.md §8).
# Backups live in tmp/refactor/backup/<STEP>/ (tmp/ is git-ignored), so nothing is staged or committed.
#
#   sh scripts/refactor/step-backup.sh save    RF-07 <every file the step will edit or create>
#   sh scripts/refactor/step-backup.sh diff    RF-07      # show ONLY this step's changes (for review)
#   sh scripts/refactor/step-backup.sh restore RF-07      # undo this step (most recent step only)
#   sh scripts/refactor/step-backup.sh list    RF-07      # show the files recorded for the step
#
# `save` may be called again in the same step to add files; an already-saved original is never overwritten.
# Files that did not exist at save time are recorded as new: `restore` deletes them.
# Only restore the most recent step. Restoring an older step would also undo later edits to the same files.
set -eu
cd "$(dirname "$0")/../.."

[ $# -ge 2 ] || { echo "usage: $0 save|diff|restore|list STEP [files...]" >&2; exit 2; }
action=$1
step=$2
shift 2
dir="tmp/refactor/backup/$step"

case $action in
save)
  mkdir -p "$dir"
  touch "$dir/.files" "$dir/.new-files"
  for f in "$@"; do
    if grep -qxF "$f" "$dir/.files"; then continue; fi
    echo "$f" >> "$dir/.files"
    if [ -e "$f" ]; then
      mkdir -p "$dir/$(dirname "$f")"
      cp -p "$f" "$dir/$f"
    else
      echo "$f" >> "$dir/.new-files"
    fi
  done
  echo "Backup $dir: $(wc -l < "$dir/.files" | tr -d ' ') file(s) recorded"
  ;;
diff)
  [ -f "$dir/.files" ] || { echo "No backup for $step" >&2; exit 1; }
  while IFS= read -r f; do
    if grep -qxF "$f" "$dir/.new-files"; then
      [ -e "$f" ] && diff -u /dev/null "$f" | sed "1s|.*|--- (new file)|;2s|.*|+++ $f|" || true
    else
      diff -u "$dir/$f" "$f" | sed "1s|.*|--- $f (before $step)|;2s|.*|+++ $f|" || true
    fi
  done < "$dir/.files"
  ;;
restore)
  [ -f "$dir/.files" ] || { echo "No backup for $step" >&2; exit 1; }
  while IFS= read -r f; do
    if grep -qxF "$f" "$dir/.new-files"; then
      rm -f "$f"
    else
      cp -p "$dir/$f" "$f"
    fi
  done < "$dir/.files"
  echo "Restored $(wc -l < "$dir/.files" | tr -d ' ') file(s) to their state before $step"
  ;;
list)
  [ -f "$dir/.files" ] || { echo "No backup for $step" >&2; exit 1; }
  cat "$dir/.files"
  ;;
*)
  echo "usage: $0 save|diff|restore|list STEP [files...]" >&2
  exit 2
  ;;
esac
