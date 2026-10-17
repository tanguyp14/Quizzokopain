#!/bin/sh
# Builds neutron-o2switch.zip: the site ready for « Setup Node.js App » on o2switch
# (the code only: no node_modules, no tests, no database). Usage: sh scripts/o2switch/build.sh [out.zip]
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-neutron-o2switch.zip}"
rm -f "$OUT"
python3 - "$OUT" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
keep = ['package.json', 'package-lock.json', 'src', 'public', 'quiz-sources']
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for item in keep:
        if os.path.isfile(item):
            z.write(item)
            continue
        for root, _, files in os.walk(item):
            for f in files:
                z.write(os.path.join(root, f))
    z.write('scripts/o2switch/LISEZMOI.txt', 'LISEZMOI-o2switch.txt')
print(out, os.path.getsize(out) // 1024, 'Ko')
PY
