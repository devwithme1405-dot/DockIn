#!/usr/bin/env bash
# Compile the Android sources without the Android SDK.
#
# The SDK and Maven are not reachable from where this is written, so a typo in
# the Java is normally only found by a CI run several minutes later. The stubs
# beside this script declare just enough of the Android and library API for
# javac to typecheck the app's own code — which is where the mistakes are.
#
# It proves the code compiles, nothing more: it cannot tell you the APK works.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
log="$out/javac.log"
set +e
javac -nowarn -d "$out" \
  $(find "$here/android-stubs" -name '*.java') \
  $(find "$here/../android/app/src/main/java" -name '*.java') >"$log" 2>&1
code=$?
set -e
grep -v 'uses or overrides a deprecated API' "$log" | grep -v 'Recompile with -Xlint' || true
if [ "$code" -ne 0 ]; then
  echo "android: javac refused this" >&2
  exit 1
fi

# Every string the Java refers to must actually exist in strings.xml. The stub R
# would otherwise happily typecheck a name nobody ever defined.
strings="$here/../android/app/src/main/res/values/strings.xml"
missing=0
for name in $(grep -oE 'R\.string\.[a-z_]+' -r "$here/../android/app/src/main/java" | sed 's/.*R\.string\.//' | sort -u); do
  grep -q "name=\"$name\"" "$strings" || { echo "android: strings.xml has no $name" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1

echo "android: javac is happy, and every string exists"
