#!/usr/bin/env bash
# Camu.dayOutBody on the JVM: the Day Out DockIn sends must match MyCamu's own form.
# the stub ones.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
javac -nowarn -d "$out" \
  "$here/android-tests/org/json/JSONObject.java" "$here/android-tests/org/json/JSONArray.java" \
  $(find "$here/android-stubs" -name '*.java' | grep -v 'org/json/JSONObject.java\|org/json/JSONArray.java') \
  $(find "$here/../android/app/src/main/java" -name '*.java') \
  "$here/android-tests/com/dockin/student/PassBodyTest.java" 2>&1 | grep -v 'deprecated API\|Recompile with\|Picked up' || true
java -cp "$out" com.dockin.student.PassBodyTest 2>&1 | grep -v 'Picked up'
