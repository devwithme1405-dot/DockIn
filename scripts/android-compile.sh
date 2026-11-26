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
  $(find "$here/../android/app/src/main/java" "$here/../android-admin/app/src/main/java" -name '*.java') >"$log" 2>&1
code=$?
set -e
grep -v 'uses or overrides a deprecated API' "$log" | grep -v 'Recompile with -Xlint' || true
if [ "$code" -ne 0 ]; then
  echo "android: javac refused this" >&2
  exit 1
fi

# Every string and drawable the Java refers to must actually exist in res/. The
# stub R would otherwise happily typecheck a name nobody ever defined.
res="$here/../android/app/src/main/res"
java="$here/../android/app/src/main/java"
missing=0
for name in $(grep -ohE 'R\.string\.[a-z_]+' -r "$java" | sed 's/.*R\.string\.//' | sort -u); do
  grep -q "name=\"$name\"" "$res/values/strings.xml" || { echo "android: strings.xml has no $name" >&2; missing=1; }
done
for name in $(grep -ohE 'R\.drawable\.[a-z_]+' -r "$java" | sed 's/.*R\.drawable\.//' | sort -u); do
  ls "$res"/drawable*/"$name".* >/dev/null 2>&1 || { echo "android: no drawable called $name" >&2; missing=1; }
done
for name in $(grep -ohE 'R\.layout\.[a-z_]+' -r "$java" | sed 's/.*R\.layout\.//' | sort -u); do
  [ -f "$res/layout/$name.xml" ] || { echo "android: no layout called $name" >&2; missing=1; }
done
for name in $(grep -ohE 'R\.id\.[a-z0-9_]+' -r "$java" | sed 's/.*R\.id\.//' | sort -u); do
  grep -rq "@+id/$name\"" "$res/layout" || { echo "android: no view with id $name" >&2; missing=1; }
done
# Every widget the manifest names has its provider info and layout.
for name in $(grep -ohE '@xml/widget_[a-z_]+_info' "$here/../android/app/src/main/AndroidManifest.xml" | sed 's/@xml\///' | sort -u); do
  [ -f "$res/xml/$name.xml" ] || { echo "android: no $name.xml" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1

# The plugin is only reachable if MainActivity registers it.
grep -q 'registerPlugin(DockInPlugin.class)' "$java/com/dockin/student/MainActivity.java" \
  || { echo "android: MainActivity does not register DockInPlugin" >&2; exit 1; }

echo "android: javac is happy and every resource exists"
